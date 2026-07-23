import { Op } from "sequelize";
import { subDays } from "date-fns";
import MessageMediaFile from "../../models/MessageMediaFile";
import MediaDeletionAudit from "../../models/MediaDeletionAudit";
import StorageService from "../StorageService/StorageService";
import { deleteStoredMediaObject } from "./MediaDeleteObjectService";
import { getOrphanMinAgeDays } from "../StorageService/storageEnv";
import { logger } from "../../utils/logger";

export const findStalePendingMedia = async (
  batchSize: number
): Promise<MessageMediaFile[]> => {
  const cutoff = subDays(new Date(), getOrphanMinAgeDays());

  return MessageMediaFile.findAll({
    where: {
      status: "pending",
      createdAt: { [Op.lte]: cutoff },
      deletedAt: null
    },
    order: [["createdAt", "ASC"]],
    limit: batchSize
  });
};

export const reconcileMissingStorageObjects = async (
  batchSize: number
): Promise<{ checked: number; marked: number }> => {
  const rows = await MessageMediaFile.findAll({
    where: {
      status: "available",
      deletedAt: null,
      storageKey: { [Op.ne]: null }
    },
    order: [["createdAt", "ASC"]],
    limit: batchSize
  });

  let marked = 0;

  await Promise.all(
    rows.map(async media => {
      if (!media.storageKey) {
        return;
      }

      await StorageService.ensureReady(media.companyId);
      const exists = await StorageService.exists(
        media.storageKey,
        media.companyId
      );

      if (!exists) {
        await media.update({
          status: "expired",
          deletedAt: new Date(),
          lastDeleteError: "object_missing_in_storage"
        });
        marked += 1;
      }
    })
  );

  return { checked: rows.length, marked };
};

export const processOrphanCleanupBatch = async (
  batchSize = 200
): Promise<{
  stalePending: number;
  missingObjects: number;
  deletedPending: number;
}> => {
  const stalePendingRows = await findStalePendingMedia(batchSize);
  let deletedPending = 0;

  await Promise.all(
    stalePendingRows.map(async media => {
      const result = await deleteStoredMediaObject(media);
      if (result.removed) {
        deletedPending += 1;
      } else {
        await media.update({
          status: "delete_failed",
          lastDeleteError: "stale_pending_cleanup"
        });
      }
    })
  );

  const reconcile = await reconcileMissingStorageObjects(batchSize);

  await MediaDeletionAudit.create({
    companyId: stalePendingRows[0]?.companyId || 1,
    ticketId: null,
    requestedByUserId: null,
    operation: "orphan_cleanup",
    reason: "weekly_orphan_scan",
    messageCount: 0,
    mediaCount: stalePendingRows.length + reconcile.marked,
    bytesRemoved: 0,
    status: "completed",
    details: {
      stalePending: stalePendingRows.length,
      deletedPending,
      missingObjects: reconcile.marked,
      checked: reconcile.checked
    }
  });

  logger.info(
    {
      stalePending: stalePendingRows.length,
      deletedPending,
      missingObjects: reconcile.marked
    },
    "Orphan cleanup batch finished"
  );

  return {
    stalePending: stalePendingRows.length,
    missingObjects: reconcile.marked,
    deletedPending
  };
};
