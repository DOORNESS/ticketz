import crypto from "crypto";
import { getAiInboundQueue } from "../AiInboundQueueService";
import { ToolExecutionResult } from "./ToolRegistry";

const TTL_SECONDS = 24 * 60 * 60;

const buildKey = (companyId: number, idempotencyKey: string): string =>
  `ai:tool-idem:${companyId}:${idempotencyKey}`;

export const buildToolIdempotencyKey = (input: {
  toolId: string;
  ticketId: number;
  contactId: number;
  payload: Record<string, unknown>;
}): string =>
  crypto
    .createHash("sha256")
    .update(
      [
        input.toolId,
        input.ticketId,
        input.contactId,
        JSON.stringify(input.payload)
      ].join("|")
    )
    .digest("hex")
    .slice(0, 48);

export const getCachedToolResult = async (
  companyId: number,
  idempotencyKey: string
): Promise<ToolExecutionResult | null> => {
  const redis = getAiInboundQueue().client;
  const raw = await redis.get(buildKey(companyId, idempotencyKey));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ToolExecutionResult;
  } catch {
    return null;
  }
};

export const cacheToolResult = async (
  companyId: number,
  idempotencyKey: string,
  result: ToolExecutionResult
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  await redis.set(
    buildKey(companyId, idempotencyKey),
    JSON.stringify(result),
    "EX",
    TTL_SECONDS
  );
};
