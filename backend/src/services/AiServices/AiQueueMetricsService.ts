import { Job } from "bull";
import { getAiInboundQueue } from "./AiInboundQueueService";

const METRICS_PREFIX = "ai:metrics";

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export type AiQueueMetrics = {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  retries: number;
  avgDurationMs: number;
  maxDurationMs: number;
  congested: boolean;
  concurrency: number;
  debounceMs: number;
};

const getRedis = () => getAiInboundQueue().client;

export const recordAiJobStarted = async (job: Job): Promise<void> => {
  const redis = getRedis();
  await redis.hset(`${METRICS_PREFIX}:job:${job.id}`, "startedAt", Date.now());
};

export const recordAiJobCompleted = async (
  job: Job,
  outcome: "completed" | "failed" | "cancelled"
): Promise<void> => {
  const redis = getRedis();
  const startedAt = Number(
    await redis.hget(`${METRICS_PREFIX}:job:${job.id}`, "startedAt")
  );
  const durationMs =
    Number.isFinite(startedAt) && startedAt > 0
      ? Math.max(0, Date.now() - startedAt)
      : 0;

  if (durationMs > 0) {
    await redis.lpush(`${METRICS_PREFIX}:durations`, String(durationMs));
    await redis.ltrim(`${METRICS_PREFIX}:durations`, 0, 499);
    const currentMax = Number(await redis.get(`${METRICS_PREFIX}:maxDuration`));
    if (!Number.isFinite(currentMax) || durationMs > currentMax) {
      await redis.set(`${METRICS_PREFIX}:maxDuration`, String(durationMs));
    }
  }

  if (outcome === "completed") {
    await redis.incr(`${METRICS_PREFIX}:completed`);
  } else if (outcome === "failed") {
    await redis.incr(`${METRICS_PREFIX}:failed`);
  }

  if (job.attemptsMade > 1) {
    await redis.incrby(
      `${METRICS_PREFIX}:retries`,
      String(job.attemptsMade - 1)
    );
  }

  await redis.del(`${METRICS_PREFIX}:job:${job.id}`);
};

export const getAiQueueMetrics = async (): Promise<AiQueueMetrics> => {
  const queue = getAiInboundQueue();
  const redis = getRedis();
  const counts = await queue.getJobCounts();
  const durations = await redis.lrange(`${METRICS_PREFIX}:durations`, 0, -1);
  const durationValues = durations
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0);

  const avgDurationMs = durationValues.length
    ? Math.round(
        durationValues.reduce((sum, value) => sum + value, 0) /
          durationValues.length
      )
    : 0;

  const maxDurationMs = Number(
    await redis.get(`${METRICS_PREFIX}:maxDuration`)
  );
  const retries = Number(await redis.get(`${METRICS_PREFIX}:retries`));
  const completed = Number(await redis.get(`${METRICS_PREFIX}:completed`));
  const failed = Number(await redis.get(`${METRICS_PREFIX}:failed`));

  const waiting = counts.waiting || 0;
  const delayed = counts.delayed || 0;
  const active = counts.active || 0;
  const congestionThreshold = parsePositiveInt(
    process.env.AI_QUEUE_CONGESTION_THRESHOLD,
    50
  );

  return {
    waiting,
    active,
    delayed,
    completed: Number.isFinite(completed) ? completed : 0,
    failed: Number.isFinite(failed) ? failed : 0,
    retries: Number.isFinite(retries) ? retries : 0,
    avgDurationMs,
    maxDurationMs: Number.isFinite(maxDurationMs) ? maxDurationMs : 0,
    congested: waiting + delayed >= congestionThreshold,
    concurrency: parsePositiveInt(process.env.AI_QUEUE_CONCURRENCY, 5),
    debounceMs: parsePositiveInt(process.env.AI_QUEUE_DEBOUNCE_MS, 2000)
  };
};
