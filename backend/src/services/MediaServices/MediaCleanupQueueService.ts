import Queue from "bull";
import { logger } from "../../utils/logger";
import {
  getMediaCleanupBatchSize,
  isMediaCleanupEnabled
} from "../StorageService/storageEnv";
import {
  deleteStoredMediaBatch,
  findExpiredConversationMedia
} from "./MediaDeleteObjectService";
import { processPermanentTicketDeletion } from "./PermanentDeleteTicketService";
import { processOrphanCleanupBatch } from "./MediaOrphanCleanupService";
import MediaDeletionAudit from "../../models/MediaDeletionAudit";

type PermanentDeleteJob = {
  companyId: number;
  ticketId: number;
  auditId: number;
  requestedByUserId: number;
};

type RetentionCleanupJob = {
  batchSize?: number;
};

type OrphanCleanupJob = {
  batchSize?: number;
};

const connection = process.env.REDIS_URI || "";

let mediaCleanupQueue: Queue.Queue<
  PermanentDeleteJob | RetentionCleanupJob | OrphanCleanupJob
> | null = null;

export const getMediaCleanupQueue = (): Queue.Queue<
  PermanentDeleteJob | RetentionCleanupJob | OrphanCleanupJob
> => {
  if (!mediaCleanupQueue) {
    mediaCleanupQueue = new Queue("MediaCleanupQueue", connection);
  }
  return mediaCleanupQueue;
};

export const enqueuePermanentTicketDeletion = async (
  payload: PermanentDeleteJob
): Promise<void> => {
  const queue = getMediaCleanupQueue();
  await queue.add("PermanentDeleteTicket", payload, {
    jobId: `permanent-delete-${payload.companyId}-${payload.ticketId}`,
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }
  });
};

export const enqueueRetentionCleanup = async (): Promise<void> => {
  if (!isMediaCleanupEnabled()) {
    return;
  }

  const queue = getMediaCleanupQueue();
  const dayKey = new Date().toISOString().slice(0, 10);
  await queue.add(
    "RetentionCleanup",
    { batchSize: getMediaCleanupBatchSize() },
    {
      jobId: `retention-cleanup-${dayKey}`,
      removeOnComplete: 20,
      removeOnFail: 20
    }
  );
};

export const processRetentionCleanupBatch = async (
  batchSize = getMediaCleanupBatchSize()
): Promise<{
  processed: number;
  deleted: number;
  bytesRemoved: number;
  failed: number;
}> => {
  const rows = await findExpiredConversationMedia(batchSize);
  if (!rows.length) {
    return { processed: 0, deleted: 0, bytesRemoved: 0, failed: 0 };
  }

  const result = await deleteStoredMediaBatch(rows);

  await MediaDeletionAudit.create({
    companyId: rows[0]?.companyId || 1,
    ticketId: null,
    requestedByUserId: null,
    operation: "retention_cleanup",
    reason: "media_retention_policy",
    messageCount: 0,
    mediaCount: rows.length,
    bytesRemoved: result.bytesRemoved,
    status: "completed",
    details: {
      deleted: result.deletedCount,
      failed: result.failedCount
    }
  });

  return {
    processed: rows.length,
    deleted: result.deletedCount,
    bytesRemoved: result.bytesRemoved,
    failed: result.failedCount
  };
};

export const startMediaCleanupQueue = (): void => {
  const queue = getMediaCleanupQueue();

  queue.process("PermanentDeleteTicket", 2, async job => {
    const data = job.data as PermanentDeleteJob;
    await processPermanentTicketDeletion(data);
  });

  queue.process("RetentionCleanup", 1, async job => {
    const data = job.data as RetentionCleanupJob;
    let totalProcessed = 0;
    let totalDeleted = 0;
    let totalBytes = 0;
    let totalFailed = 0;

    for (let i = 0; i < 20; i += 1) {
      const batch = await processRetentionCleanupBatch(
        data.batchSize || getMediaCleanupBatchSize()
      );
      totalProcessed += batch.processed;
      totalDeleted += batch.deleted;
      totalBytes += batch.bytesRemoved;
      totalFailed += batch.failed;
      if (batch.processed === 0) {
        break;
      }
    }

    logger.info(
      {
        totalProcessed,
        totalDeleted,
        totalBytes,
        totalFailed
      },
      "Retention cleanup batch finished"
    );
  });

  queue.process("OrphanCleanup", 1, async job => {
    const data = job.data as OrphanCleanupJob;
    await processOrphanCleanupBatch(data.batchSize || 200);
  });

  queue.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, name: job?.name, error: error?.message },
      "Media cleanup job failed"
    );
  });
};

export const scheduleDailyRetentionCleanup = (): void => {
  if (!isMediaCleanupEnabled()) {
    return;
  }

  const queue = getMediaCleanupQueue();
  queue.add(
    "RetentionCleanup",
    { batchSize: getMediaCleanupBatchSize() },
    {
      repeat: { cron: "30 3 * * *" },
      jobId: "retention-cleanup-daily"
    }
  );

  queue.add(
    "OrphanCleanup",
    { batchSize: 200 },
    {
      repeat: { cron: "0 4 * * 0" },
      jobId: "orphan-cleanup-weekly"
    }
  );
};
