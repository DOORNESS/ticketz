import Queue from "bull";
import Company from "../../../models/Company";
import { logger } from "../../../utils/logger";
import { upsertDailySnapshot } from "./AiMetricsSnapshotService";

const connection = process.env.REDIS_URI || "";
const QUEUE_NAME = "AiMetricsQueue";

let metricsQueue: Queue.Queue | null = null;

export const getAiMetricsQueue = (): Queue.Queue => {
  if (!metricsQueue) {
    metricsQueue = new Queue(QUEUE_NAME, connection);
  }
  return metricsQueue;
};

export const startAiMetricsQueue = (): void => {
  const queue = getAiMetricsQueue();

  queue.process("aggregate-daily-snapshot", async job => {
    const companyId = Number(job.data.companyId);
    const periodStart = job.data.periodStart
      ? new Date(job.data.periodStart)
      : new Date();

    await upsertDailySnapshot(companyId, periodStart);
    logger.info({ companyId, periodStart }, "AI metrics daily snapshot stored");
  });

  queue.add(
    "aggregate-daily-snapshot",
    {},
    {
      repeat: { cron: "15 0 * * *" },
      jobId: "ai-metrics-daily-all"
    }
  );

  queue.process("aggregate-company-daily", async job => {
    const companyId = Number(job.data.companyId);
    await upsertDailySnapshot(companyId, new Date());
  });

  logger.info("AiMetricsQueue started");
};

export const enqueueCompanyMetricsSnapshot = async (
  companyId: number
): Promise<void> => {
  const queue = getAiMetricsQueue();
  await queue.add(
    "aggregate-company-daily",
    { companyId },
    { removeOnComplete: true }
  );
};

export const enqueueAllCompanySnapshots = async (): Promise<void> => {
  const companies = await Company.findAll({ attributes: ["id"] });
  await Promise.all(
    companies.map(company => enqueueCompanyMetricsSnapshot(company.id))
  );
};
