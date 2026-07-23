import { Op } from "sequelize";
import MessageMediaFile from "../../models/MessageMediaFile";
import StorageService from "../StorageService/StorageService";
import { logger } from "../../utils/logger";

const isNotFoundDeleteError = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("nosuchkey") ||
    message.includes("404")
  );
};

export const deleteStoredMediaObject = async (
  media: MessageMediaFile
): Promise<{ removed: boolean; bytesRemoved: number }> => {
  if (media.status === "deleted") {
    return { removed: true, bytesRemoved: 0 };
  }

  await media.update({
    status: "delete_pending",
    deleteRequestedAt: media.deleteRequestedAt || new Date(),
    deleteAttempts: (media.deleteAttempts || 0) + 1
  });

  try {
    if (media.storageKey) {
      try {
        await StorageService.delete(media.storageKey, media.companyId);
      } catch (error) {
        if (!isNotFoundDeleteError(error)) {
          throw error;
        }
      }
    }

    await media.update({
      status: "deleted",
      deletedAt: new Date(),
      lastDeleteError: null
    });

    return {
      removed: true,
      bytesRemoved: Number(media.sizeBytes || 0)
    };
  } catch (error) {
    const sanitized =
      error instanceof Error ? error.message.slice(0, 240) : "delete_failed";

    await media.update({
      status: "delete_failed",
      lastDeleteError: sanitized
    });

    logger.error(
      { mediaId: media.id, companyId: media.companyId, error: sanitized },
      "Failed to delete stored media object"
    );

    return { removed: false, bytesRemoved: 0 };
  }
};

export const deleteStoredMediaBatch = async (
  mediaRows: MessageMediaFile[]
): Promise<{
  deletedCount: number;
  bytesRemoved: number;
  failedCount: number;
}> => {
  let deletedCount = 0;
  let bytesRemoved = 0;
  let failedCount = 0;

  await Promise.all(
    mediaRows.map(async media => {
      const result = await deleteStoredMediaObject(media);
      if (result.removed) {
        deletedCount += 1;
        bytesRemoved += result.bytesRemoved;
      } else {
        failedCount += 1;
      }
    })
  );

  return { deletedCount, bytesRemoved, failedCount };
};

export const findExpiredConversationMedia = async (
  batchSize: number
): Promise<MessageMediaFile[]> => {
  const now = new Date();

  return MessageMediaFile.findAll({
    where: {
      retentionExempt: false,
      deletedAt: null,
      status: {
        [Op.in]: ["available", "delete_pending", "delete_failed"]
      },
      expiresAt: {
        [Op.lte]: now
      }
    },
    order: [["expiresAt", "ASC"]],
    limit: batchSize
  });
};

export const findTicketMediaForDeletion = async (
  ticketId: number,
  companyId: number
): Promise<MessageMediaFile[]> =>
  MessageMediaFile.findAll({
    where: {
      ticketId,
      companyId,
      deletedAt: null,
      status: {
        [Op.notIn]: ["deleted"]
      }
    }
  });
