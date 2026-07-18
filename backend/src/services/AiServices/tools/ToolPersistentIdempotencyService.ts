import crypto from "crypto";
import { UniqueConstraintError } from "sequelize";
import AiToolIdempotencyRecord from "../../../models/AiToolIdempotencyRecord";
import { getAiInboundQueue } from "../AiInboundQueueService";
import { ToolExecutionResult } from "./ToolRegistry";
import { sanitizeToolLogPayload } from "./ToolLogSanitizer";

const LOCK_TTL_SECONDS = 30;

const buildLockKey = (companyId: number, idempotencyKey: string): string =>
  `ai:tool-lock:${companyId}:${idempotencyKey}`;

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

export const buildCorrelationId = (input: {
  companyId: number;
  toolId: string;
  toolCallId: string;
}): string =>
  crypto
    .createHash("sha256")
    .update(
      [input.companyId, input.toolId, input.toolCallId, Date.now()].join("|")
    )
    .digest("hex")
    .slice(0, 32);

const parseStoredResult = (raw: string): ToolExecutionResult => {
  try {
    return JSON.parse(raw) as ToolExecutionResult;
  } catch {
    return { success: false, output: raw, errorCode: "invalid_stored_result" };
  }
};

export const findPersistedToolResult = async (
  companyId: number,
  idempotencyKey: string
): Promise<ToolExecutionResult | null> => {
  const row = await AiToolIdempotencyRecord.findOne({
    where: { companyId, idempotencyKey }
  });
  if (!row) return null;
  return parseStoredResult(row.resultSanitized);
};

export const executeWithPersistentIdempotency = async (input: {
  companyId: number;
  toolId: string;
  ticketId: number;
  contactId: number;
  aiAgentId: number;
  idempotencyKey: string;
  correlationId: string;
  execute: () => Promise<ToolExecutionResult>;
}): Promise<{ result: ToolExecutionResult; reused: boolean }> => {
  const existing = await findPersistedToolResult(
    input.companyId,
    input.idempotencyKey
  );
  if (existing) {
    return { result: existing, reused: true };
  }

  const redis = getAiInboundQueue().client;
  const lockKey = buildLockKey(input.companyId, input.idempotencyKey);
  const lock = await redis.set(
    lockKey,
    input.correlationId,
    "EX",
    LOCK_TTL_SECONDS,
    "NX"
  );

  if (lock !== "OK") {
    await new Promise(resolve => setTimeout(resolve, 150));
    const afterLock = await findPersistedToolResult(
      input.companyId,
      input.idempotencyKey
    );
    if (afterLock) {
      return { result: afterLock, reused: true };
    }
  }

  try {
    const afterWait = await findPersistedToolResult(
      input.companyId,
      input.idempotencyKey
    );
    if (afterWait) {
      return { result: afterWait, reused: true };
    }

    const result = await input.execute();
    const sanitized = sanitizeToolLogPayload(result.output).value;

    let mutationTarget: string | null = null;
    let mutationTargetId: string | null = null;
    try {
      const parsed = JSON.parse(result.output) as {
        mutationTarget?: string;
        mutationTargetId?: string;
        tagId?: number;
        queueId?: number;
        scheduleId?: number;
        memoryId?: number;
        priority?: string;
      };
      mutationTarget = parsed.mutationTarget || null;
      mutationTargetId =
        parsed.mutationTargetId ||
        String(
          parsed.tagId ||
            parsed.queueId ||
            parsed.scheduleId ||
            parsed.memoryId ||
            parsed.priority ||
            ""
        ) ||
        null;
    } catch {
      mutationTarget = null;
    }

    try {
      await AiToolIdempotencyRecord.create({
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        toolId: input.toolId,
        ticketId: input.ticketId,
        contactId: input.contactId,
        aiAgentId: input.aiAgentId,
        correlationId: input.correlationId,
        success: result.success,
        resultSanitized: sanitized,
        mutationTarget,
        mutationTargetId
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const persisted = await findPersistedToolResult(
          input.companyId,
          input.idempotencyKey
        );
        if (persisted) {
          return { result: persisted, reused: true };
        }
      }
      throw error;
    }

    return { result, reused: false };
  } finally {
    await redis.del(lockKey);
  }
};
