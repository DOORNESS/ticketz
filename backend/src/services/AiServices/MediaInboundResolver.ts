import { evaluateAudioTranscriptionPolicy } from "./Triage/AudioTranscriptionPolicyService";
import Message from "../../models/Message";
import MessageMediaFile from "../../models/MessageMediaFile";
import StorageService from "../StorageService/StorageService";
import { analyzeInboundImage } from "./AiVisionOcrService";
import { extractTextFromBuffer } from "./DocumentParser";
import { logger } from "../../utils/logger";
import { resolveInboundAudioText } from "./AudioInboundResolver";
import AiAgent from "../../models/AiAgent";
import Ticket from "../../models/Ticket";
import { InboundMessageItem } from "./ProcessInboundMessageService";
import {
  readMediaBuffer,
  extractStorageKeyFromUrl
} from "../../helpers/mediaStorage";

const buildPublicMediaUrl = (mediaUrl: string): string => {
  if (mediaUrl.startsWith("http")) {
    const storageKey = extractStorageKeyFromUrl(mediaUrl);
    if (storageKey) {
      return `${process.env.BACKEND_URL || "http://localhost:8080"}/public/${storageKey}`;
    }
    return mediaUrl;
  }

  const publicUrl = StorageService.getPublicUrl(mediaUrl);
  return publicUrl.startsWith("http")
    ? publicUrl
    : `${process.env.BACKEND_URL || "http://localhost:8080"}${publicUrl}`;
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

  if (!message.mediaUrl) {
    return messageText;
  }

  const existingMedia = message.messageId
    ? await MessageMediaFile.findOne({
        where: { companyId, messageId: message.messageId }
      })
    : null;

  if (existingMedia?.transcriptionText && message.mediaType === "audio") {
    return existingMedia.transcriptionText;
  }

  if (existingMedia?.visionSummary && message.mediaType === "image") {
    return messageText
      ? `${messageText}\n\n[Imagem enviada pelo cliente]: ${existingMedia.visionSummary}`
      : `[Imagem enviada pelo cliente]: ${existingMedia.visionSummary}`;
  }

  const mediaBuffer =
    (await readMediaBuffer(message.mediaUrl, companyId)) || undefined;

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

    if (!existingMedia) {
      try {
        const uploadMeta = resolveExistingUpload(message.mediaUrl);
        await persistMediaFile({
          companyId,
          ticket,
          message,
          upload: uploadMeta,
          mediaType: "audio",
          extras: { transcriptionText: messageText }
        });
      } catch (error) {
        logger.warn(
          { error, messageId: message.messageId },
          "Audio metadata persistence failed"
        );
      }
    }

    return messageText;
  }

  if (message.mediaType === "image") {
    try {
      const imageUrl = buildPublicMediaUrl(message.mediaUrl);
      const vision = await analyzeInboundImage({
        companyId,
        imageUrl,
        visionModel: agent.visionModel,
        providerId: agent.provider,
        caption: messageText
      });

      if (!existingMedia) {
        const uploadMeta = resolveExistingUpload(message.mediaUrl);
        await persistMediaFile({
          companyId,
          ticket,
          message,
          upload: uploadMeta,
          mediaType: "image",
          extras: { visionSummary: vision.summary }
        });
      }

      messageText = messageText
        ? `${messageText}\n\n[Imagem enviada pelo cliente]: ${vision.summary}`
        : `[Imagem enviada pelo cliente]: ${vision.summary}`;
    } catch (error) {
      logger.error(
        { error, ticketId: ticket.id, messageId: message.messageId },
        "Image analysis failed"
      );
      messageText =
        messageText ||
        "[Imagem enviada pelo cliente — análise indisponível no momento]";
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
