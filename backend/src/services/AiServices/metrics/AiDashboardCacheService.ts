import { getAiInboundQueue } from "../AiInboundQueueService";

const CACHE_TTL_SECONDS = 300;

const cacheKey = (companyId: number): string => `ai:dashboard:${companyId}:v2`;

export const getCachedDashboard = async (
  companyId: number
): Promise<Record<string, unknown> | null> => {
  const redis = getAiInboundQueue().client;
  const raw = await redis.get(cacheKey(companyId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const setCachedDashboard = async (
  companyId: number,
  payload: Record<string, unknown>
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  await redis.set(
    cacheKey(companyId),
    JSON.stringify(payload),
    "EX",
    CACHE_TTL_SECONDS
  );
};

export const invalidateDashboardCache = async (
  companyId: number
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  await redis.del(cacheKey(companyId));
};
