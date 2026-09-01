import { evaluateAudioTranscriptionPolicy } from "./Triage/AudioTranscriptionPolicyService";
import Message from "../../models/Message";
import MessageMediaFile from "../../models/MessageMediaFile";
import StorageService from "../StorageService/StorageService";
import {
  analyzeInboundImage,
  formatInboundImageContext,
  resolveVisionImageSource
} from "./AiVisionOcrService";
import { extractTextFromBuffer } from "./DocumentParser";
import { logger } from "../../utils/logger";
import { resolveInboundAudioText } from "./AudioInboundResolver";
import AiAgent from "../../models/AiAgent";
import Ticket from "../../models/Ticket";
import { InboundMessageItem } from "./ProcessInboundMessageService";
import { readMediaBuffer } from "../../helpers/mediaStorage";
import { purgeTranscribedAudio } from "./media/UnifiedMediaPersistenceService";

const isVisualMediaType = (mediaType?: string): boolean => {
  const normalized = (mediaType || "").toLowerCase();
  return normalized === "image" || normalized === "sticker";
};

const loadInboundMediaBuffer = async ({
  companyId,
  message
}: {
  companyId: number;
  message: InboundMessageItem;
}): Promise<Buffer | undefined> => {
  if (message.mediaUrl) {
    const directBuffer = await readMediaBuffer(message.mediaUrl, companyId);
    if (directBuffer?.length) {
      return directBuffer;
    }
  }

  if (!message.messageId) {
    return undefined;
  }

  const existingMedia = await MessageMediaFile.findOne({
    where: { companyId, messageId: message.messageId }
  });

  if (existingMedia?.storageKey) {
    const storageBuffer = await readMediaBuffer(
      existingMedia.storageKey,
      companyId
    );
    if (storageBuffer?.length) {
      return storageBuffer;
    }
  }

  return undefined;
};

const appendImageUnavailableNotice = (
  messageText: string,
  reason = "análise indisponível no momento"
): string => {
  const notice = `[Imagem enviada pelo cliente — ${reason}]`;
  if (messageText.includes("[Imagem enviada pelo cliente")) {
    return messageText;
  }

  return messageText ? `${messageText}\n\n${notice}` : notice;
};

const isDocumentMedia = (mediaType?: string, mimeType?: string): boolean => {
  const mime = (mimeType || "").toLowerCase();
  const type = (mediaType || "").toLowerCase();

  return (
    type === "application" ||
    type === "document" ||
    mime.includes("pdf") ||
    mime.includes("document") ||
    mime.includes("msword") ||
    mime.includes("spreadsheet")
  );
};

const persistMediaFile = async ({
  companyId,
  ticket,
  message,
  upload,
  mediaType,
  extras = {}
}: {
  companyId: number;
  ticket: Ticket;
  message: InboundMessageItem;
  upload: {
    provider: string;
    bucket: string;
    key: string;
    publicUrl: string;
    sizeBytes: number;
    hash: string;
  };
  mediaType: string;
  extras?: {
    transcriptionText?: string;
    visionSummary?: string;
  };
}): Promise<MessageMediaFile> => {
  const existing = message.messageId
    ? await MessageMediaFile.findOne({
        where: { companyId, messageId: message.messageId }
      })
    : null;

  if (existing) {
    await existing.update({
      mediaType,
      mimeType: message.mediaMimeType,
      originalFilename: message.mediaFilename,
      sizeBytes: upload.sizeBytes,
      storageProvider: upload.provider,
      storageKey: upload.key,
      bucket: upload.bucket,
      publicUrl: upload.publicUrl,
      hash: upload.hash,
      ...extras
    });
    return existing.reload();
  }

  return MessageMediaFile.create({
    companyId,
    ticketId: ticket.id,
    messageId: message.messageId,
    mediaType,
    mimeType: message.mediaMimeType,
    originalFilename: message.mediaFilename,
    sizeBytes: upload.sizeBytes,
    storageProvider: upload.provider,
    storageKey: upload.key,
    bucket: upload.bucket,
    publicUrl: upload.publicUrl,
    hash: upload.hash,
    ...extras
  });
};

const resolveExistingUpload = (mediaUrl: string) => {
  const key = mediaUrl.startsWith("http")
    ? mediaUrl
    : mediaUrl.replace(/^\/public\//, "");

  return {
    provider: StorageService.getProvider(),
    bucket: StorageService.getProvider() === "backblaze" ? "b2" : "local",
    key,
    publicUrl: mediaUrl.startsWith("http")
      ? mediaUrl
      : StorageService.getPublicUrl(key),
    sizeBytes: 0,
    hash: ""
  };
};

const VISION_SUMMARY_WAIT_MS = 8000;
const VISION_SUMMARY_POLL_MS = 400;

const waitForStoredVisionSummary = async ({
  companyId,
  messageId,
  maxWaitMs = VISION_SUMMARY_WAIT_MS
}: {
  companyId: number;
  messageId?: string;
  maxWaitMs?: number;
}): Promise<string | null> => {
  if (!messageId) {
    return null;
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const existingMedia = await MessageMediaFile.findOne({
      where: { companyId, messageId },
      attributes: ["visionSummary"]
    });

    if (existingMedia?.visionSummary?.trim()) {
      return existingMedia.visionSummary.trim();
    }

    await new Promise(resolve => setTimeout(resolve, VISION_SUMMARY_POLL_MS));
  }

  return null;
};

export const resolveInboundMessageText = async ({
  companyId,
  ticket,
  agent,
  message
}: {
  companyId: number;
  ticket: Ticket;
  agent: AiAgent;
  message: InboundMessageItem;
}): Promise<string> => {
  let messageText = message.messageBody?.trim() || "";

  if (!message.mediaUrl && !isVisualMediaType(message.mediaType)) {
    return messageText;
  }

  if (!message.mediaUrl && isVisualMediaType(message.mediaType)) {
    return appendImageUnavailableNotice(messageText);
  }

  const existingMedia = message.messageId
    ? await MessageMediaFile.findOne({
        where: { companyId, messageId: message.messageId }
      })
    : null;

  if (existingMedia?.transcriptionText && message.mediaType === "audio") {
    return existingMedia.transcriptionText;
  }

  if (existingMedia?.visionSummary && isVisualMediaType(message.mediaType)) {
    return formatInboundImageContext(messageText, existingMedia.visionSummary);
  }

  if (isVisualMediaType(message.mediaType) && message.messageId) {
    const pendingVision = await waitForStoredVisionSummary({
      companyId,
      messageId: message.messageId
    });

    if (pendingVision) {
      return formatInboundImageContext(messageText, pendingVision);
    }
  }

  const mediaBuffer = await loadInboundMediaBuffer({ companyId, message });

  if (!message.mediaUrl && !mediaBuffer) {
    return messageText;
  }

  if (!mediaBuffer && isVisualMediaType(message.mediaType)) {
    return appendImageUnavailableNotice(messageText);
  }

  if (!mediaBuffer) {
    return messageText;
  }

  if (message.mediaType === "audio") {
    await ticket.reload();
    const transcriptionPolicy = await evaluateAudioTranscriptionPolicy({
      ticket,
      messageId: message.messageId
    });

    if (!transcriptionPolicy.shouldTranscribe) {
      if (message.messageId) {
        await Message.update(
          {
            transcriptionStatus:
              transcriptionPolicy.reason === "human_mode"
                ? "skipped_human_mode"
                : "not_required"
          } as any,
          { where: { id: message.messageId, ticketId: ticket.id } }
        );
      }

      return messageText || "[Áudio recebido]";
    }

    const audioResult = await resolveInboundAudioText({
      companyId,
      ticketId: ticket.id,
      messageId: message.messageId,
      audioBuffer: mediaBuffer,
      mediaUrl: message.mediaUrl,
      filename: message.mediaFilename || "audio.ogg",
      mimeType: message.mediaMimeType,
      existingText: messageText,
      transcriptionModel: agent.transcriptionModel,
      providerId: agent.provider
    });

    if (!audioResult.success) {
      return "__AUDIO_TRANSCRIPTION_FAILED__";
    }

    messageText = audioResult.text;

    // `mediaFileId` só é preenchido quando a transcrição FOI GRAVADA. É essa a
    // condição que autoriza apagar o áudio adiante — texto em memória não vale.
    let mediaFileId: number | null = null;

    try {
      if (existingMedia) {
        // Registro já existia sem transcrição: gravar aqui fecha a lacuna que
        // deixava `transcriptionText` vazio para sempre nesse caminho.
        if (!existingMedia.transcriptionText?.trim()) {
          await existingMedia.update({ transcriptionText: messageText });
        }
        mediaFileId = existingMedia.id;
      } else {
        const uploadMeta = resolveExistingUpload(message.mediaUrl);
        const persisted = await persistMediaFile({
          companyId,
          ticket,
          message,
          upload: uploadMeta,
          mediaType: "audio",
          extras: { transcriptionText: messageText }
        });
        mediaFileId = persisted?.id ?? null;
      }
    } catch (error) {
      logger.warn(
        { error, messageId: message.messageId },
        "Audio metadata persistence failed"
      );
      // Sem persistência comprovada, não há purga: o áudio segue sendo o único
      // registro do que o cliente disse.
      mediaFileId = null;
    }

    if (mediaFileId) {
      // `purgeTranscribedAudio` relê o registro do banco e reavalia todas as
      // condições (áudio, inbound, transcrição gravada, não isento, flags).
      // A prova de persistência é dele, não deste ponto — por isso a chamada é
      // segura mesmo se algo acima tiver falhado parcialmente.
      //
      // Não propaga: áudio parado no bucket é custo; derrubar o atendimento
      // por causa disso seria muito pior.
      await purgeTranscribedAudio(mediaFileId).catch(error =>
        logger.warn(
          { error, mediaFileId, messageId: message.messageId },
          "Transcribed audio purge failed; message flow preserved"
        )
      );
    }

    return messageText;
  }

  if (isVisualMediaType(message.mediaType)) {
    try {
      const imageUrl = resolveVisionImageSource({
        mediaUrl: message.mediaUrl || "",
        mediaBuffer,
        mimeType: message.mediaMimeType
      });
      const vision = await analyzeInboundImage({
        companyId,
        imageUrl,
        visionModel: agent.visionModel,
        providerId: agent.provider,
        caption: messageText
      });

      if (!existingMedia && message.mediaUrl) {
        const uploadMeta = resolveExistingUpload(message.mediaUrl);
        await persistMediaFile({
          companyId,
          ticket,
          message,
          upload: uploadMeta,
          mediaType: "image",
          extras: { visionSummary: vision.summary }
        });
      } else if (existingMedia && vision.summary) {
        await existingMedia.update({ visionSummary: vision.summary });
      }

      messageText = formatInboundImageContext(messageText, vision.summary);

      if (!vision.summary?.trim()) {
        messageText = appendImageUnavailableNotice(
          messageText,
          "não foi possível extrair detalhes visuais"
        );
      }
    } catch (error) {
      logger.error(
        { error, ticketId: ticket.id, messageId: message.messageId },
        "Image analysis failed"
      );
      messageText = appendImageUnavailableNotice(messageText);
    }

    return messageText;
  }

  if (isDocumentMedia(message.mediaType, message.mediaMimeType)) {
    try {
      const ext =
        message.mediaFilename?.split(".").pop()?.toLowerCase() ||
        message.mediaMimeType?.split("/").pop() ||
        "pdf";

      const ocrText = await extractTextFromBuffer(
        mediaBuffer,
        ext,
        message.mediaFilename
      );

      if (ocrText?.trim()) {
        if (!existingMedia) {
          const uploadMeta = resolveExistingUpload(message.mediaUrl);
          await persistMediaFile({
            companyId,
            ticket,
            message,
            upload: uploadMeta,
            mediaType: "document",
            extras: { visionSummary: ocrText.slice(0, 4000) }
          });
        }

        messageText = messageText
          ? `${messageText}\n\n[Documento enviado pelo cliente]:\n${ocrText.slice(0, 3000)}`
          : `[Documento enviado pelo cliente]:\n${ocrText.slice(0, 3000)}`;
      }
    } catch (error) {
      logger.warn(
        { error, messageId: message.messageId },
        "Document OCR failed"
      );
    }
  }

  return messageText;
};
