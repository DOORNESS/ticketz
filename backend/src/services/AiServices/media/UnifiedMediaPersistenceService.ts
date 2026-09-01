import crypto from "crypto";
import { addDays } from "date-fns";
import MessageMediaFile from "../../../models/MessageMediaFile";
import Ticket from "../../../models/Ticket";
import StorageService from "../../StorageService/StorageService";
import { getMediaRetentionDays } from "../../StorageService/storageEnv";
import { logger } from "../../../utils/logger";
import { GetCompanySetting } from "../../../helpers/CheckSettings";
import {
  decideAudioPurge,
  getAudioPurgeGraceMinutes,
  isAudioPurgeEnabled
} from "./TranscribedAudioPurgePolicy";

export type PersistMediaInput = {
  companyId: number;
  ticketId: number;
  messageId?: string;
  mediaType: string;
  mimeType: string;
  filename: string;
  storageKey: string;
  publicUrl: string;
  sizeBytes: number;
  direction?: "inbound" | "outbound";
  transcriptionText?: string;
  visionSummary?: string;
  retentionExempt?: boolean;
  contactId?: number;
};

const computeExpiresAt = (retentionExempt?: boolean): Date | null => {
  if (retentionExempt) {
    return null;
  }

  return addDays(new Date(), getMediaRetentionDays());
};

export const persistUnifiedMediaFile = async (
  input: PersistMediaInput
): Promise<MessageMediaFile | null> => {
  if (!input.ticketId || !input.storageKey) {
    return null;
  }

  await StorageService.ensureReady(input.companyId);

  const hash = crypto
    .createHash("sha256")
    .update(`${input.storageKey}:${input.sizeBytes}`)
    .digest("hex");

  const payload = {
    companyId: input.companyId,
    ticketId: input.ticketId,
    messageId: input.messageId || null,
    contactId: input.contactId || null,
    mediaType: input.mediaType,
    mimeType: input.mimeType,
    originalFilename: input.filename,
    sizeBytes: input.sizeBytes,
    storageProvider: StorageService.getProvider(),
    storageKey: input.storageKey,
    bucket: StorageService.getBucketName(),
    publicUrl: input.publicUrl,
    hash,
    direction: input.direction || "inbound",
    transcriptionText: input.transcriptionText || null,
    visionSummary: input.visionSummary || null,
    status: "available" as const,
    expiresAt: computeExpiresAt(input.retentionExempt),
    retentionExempt: Boolean(input.retentionExempt)
  };

  try {
    if (input.messageId) {
      const existing = await MessageMediaFile.findOne({
        where: { companyId: input.companyId, messageId: input.messageId }
      });

      if (existing) {
        await existing.update(payload);
        return existing.reload();
      }
    }

    const existingByKey = await MessageMediaFile.findOne({
      where: { companyId: input.companyId, storageKey: input.storageKey }
    });

    if (existingByKey) {
      await existingByKey.update(payload);
      return existingByKey.reload();
    }

    return MessageMediaFile.create(payload);
  } catch (error) {
    logger.warn(
      { error, ticketId: input.ticketId, messageId: input.messageId },
      "Unified media persistence failed"
    );
    return null;
  }
};

/**
 * Apaga do storage o áudio já transcrito, preservando texto e rastro.
 *
 * O registro do `MessageMediaFile` NÃO é removido: vira `deleted` com
 * `deletedAt`. Fica a prova de que existiu um áudio, o tamanho que ocupava e a
 * transcrição. O que sai é só o objeto que pesa no bucket.
 *
 * Falha de storage não propaga: o áudio continuar lá é um problema de custo,
 * enquanto derrubar o recebimento da mensagem é um problema de atendimento.
 */
export const purgeTranscribedAudio = async (
  mediaFileId: number
): Promise<boolean> => {
  const media = await MessageMediaFile.findByPk(mediaFileId);
  if (!media) {
    return false;
  }

  const decision = decideAudioPurge(
    {
      mediaType: media.mediaType,
      direction: media.direction,
      transcriptionText: media.transcriptionText,
      retentionExempt: media.retentionExempt,
      storageKey: media.storageKey,
      createdAt: media.get("createdAt") as Date
    },
    {
      enabled: isAudioPurgeEnabled(
        await GetCompanySetting(
          media.companyId,
          "aiPurgeTranscribedAudio",
          null
        )
      ),
      graceMinutes: getAudioPurgeGraceMinutes()
    }
  );

  if (!decision.purge) {
    return false;
  }

  try {
    await StorageService.delete(media.storageKey, media.companyId);
    await media.update({
      status: "deleted",
      deletedAt: new Date(),
      publicUrl: null
    } as never);

    logger.info(
      {
        mediaFileId,
        ticketId: media.ticketId,
        sizeBytes: media.sizeBytes
      },
      "Transcribed audio purged from storage; transcript preserved"
    );
    return true;
  } catch (error) {
    await media
      .update({
        status: "delete_failed",
        lastDeleteError: error instanceof Error ? error.message : String(error),
        deleteAttempts: (media.deleteAttempts || 0) + 1
      } as never)
      .catch(() => undefined);

    logger.warn(
      { error, mediaFileId },
      "Failed to purge transcribed audio; object kept for retry"
    );
    return false;
  }
};

export const linkStoredMediaToMessage = async ({
  companyId,
  ticketId,
  messageId,
  mediaUrl,
  thumbnailUrl
}: {
  companyId: number;
  ticketId: number;
  messageId: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
}): Promise<void> => {
  const keys = [mediaUrl, thumbnailUrl]
    .filter(Boolean)
    .map(url => url?.replace(/^\/public\//, "").trim())
    .filter(Boolean) as string[];

  if (!keys.length) {
    return;
  }

  await Promise.all(
    keys.map(async storageKey => {
      const media = await MessageMediaFile.findOne({
        where: { companyId, storageKey, ticketId }
      });

      if (media && !media.messageId) {
        await media.update({ messageId });
      }
    })
  );
};

export const resolveMediaTypeFromMime = (mimetype: string): string => {
  const normalized = (mimetype || "").split(";")[0].toLowerCase();
  const [type] = normalized.split("/");

  if (type === "audio") return "audio";
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (
    normalized.includes("pdf") ||
    normalized.includes("document") ||
    normalized.includes("msword")
  ) {
    return "document";
  }

  return "attachment";
};

export const resolveTicketForMedia = async (
  destination: Ticket | number,
  companyId: number
): Promise<{ ticketId: number; companyId: number } | null> => {
  if (typeof destination === "number") {
    return { ticketId: destination, companyId };
  }

  if (destination?.id) {
    return { ticketId: destination.id, companyId: destination.companyId };
  }

  const ticket = await Ticket.findOne({
    where: { id: Number(destination), companyId }
  });

  if (!ticket) return null;
  return { ticketId: ticket.id, companyId: ticket.companyId };
};
