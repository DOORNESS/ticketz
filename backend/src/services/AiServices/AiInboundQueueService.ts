import Queue, { Job } from "bull";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import { logger } from "../../utils/logger";
import { getActiveAgent, shouldAiHandleTicket } from "./AiHelpers";
import ProcessInboundMessageService, {
  InboundMessageItem
} from "./ProcessInboundMessageService";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { isTransientAiError } from "./isTransientAiError";
import {
  recordAiJobCompleted,
  recordAiJobStarted
} from "./AiQueueMetricsService";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";

export type AiInboundPayload = {
  companyId: number;
  ticketId: number;
  messageBody: string;
  messageId?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaMimeType?: string;
  enqueuedAt: string;
};

type AiInboundJobData = {
  companyId: number;
  ticketId: number;
};

const connection = process.env.REDIS_URI || "";

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number =>
  Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback;

const getDebounceMs = (): number =>
  parsePositiveInt(process.env.AI_QUEUE_DEBOUNCE_MS, 2000);

const getMaxAttempts = (): number =>
  parsePositiveInt(process.env.AI_QUEUE_MAX_ATTEMPTS, 3);

const bufferKey = (ticketId: number): string => `ai:buffer:${ticketId}`;
const lockKey = (ticketId: number): string => `ai:lock:${ticketId}`;
const ackKey = (ticketId: number): string => `ai:ack:sent:${ticketId}`;
const debounceJobId = (ticketId: number): string => `ai-debounce-${ticketId}`;

let aiInboundQueue: Queue.Queue<AiInboundJobData> | null = null;

export const getAiInboundQueue = (): Queue.Queue<AiInboundJobData> => {
  if (!aiInboundQueue) {
    aiInboundQueue = new Queue<AiInboundJobData>("AiInboundQueue", connection);
  }
  return aiInboundQueue;
};

const drainBufferedMessages = async (
  ticketId: number
): Promise<AiInboundPayload[]> => {
  const redis = getAiInboundQueue().client;
  const rawItems = await redis.lrange(bufferKey(ticketId), 0, -1);
  await redis.del(bufferKey(ticketId));

  return rawItems
    .map(item => {
      try {
        return JSON.parse(item) as AiInboundPayload;
      } catch {
        return null;
      }
    })
    .filter((item): item is AiInboundPayload => item !== null);
};

const mapPayloadToInboundItem = (
  payload: AiInboundPayload
): InboundMessageItem => ({
  messageBody: payload.messageBody,
  messageId: payload.messageId,
  mediaType: payload.mediaType,
  mediaUrl: payload.mediaUrl,
  mediaFilename: payload.mediaFilename,
  mediaMimeType: payload.mediaMimeType
});

const revalidateTicketForAi = async (
  ticketId: number,
  companyId: number
): Promise<{ ticket: Ticket; agent: AiAgent } | null> => {
  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    include: ["contact"]
  });

  if (!ticket) {
    return null;
  }

  if (!(await shouldAiHandleTicket(ticket))) {
    return null;
  }

  const agent = await getActiveAgent(companyId, ticket.queueId);
  if (!agent?.active) {
    return null;
  }

  return { ticket, agent };
};

const sendOptionalAck = async (
  ticket: Ticket,
  agent: AiAgent,
  ticketId: number
): Promise<void> => {
  if (!agent.ackEnabled || !agent.ackMessage?.trim()) {
    return;
  }

  const redis = getAiInboundQueue().client;
  const debounceMs = getDebounceMs();
  const ackAlreadySent = await redis.set(
    ackKey(ticketId),
    "1",
    "PX",
    debounceMs + 5000,
    "NX"
  );

  if (ackAlreadySent !== "OK") {
    return;
  }

  try {
    await SendWhatsAppMessage({
      body: formatBody(agent.ackMessage.trim(), ticket),
      ticket
    });
  } catch (error) {
    await redis.del(ackKey(ticketId));
    logger.warn(
      { error, ticketId },
      "Failed to send optional AI acknowledgement message"
    );
  }
};

const scheduleDebouncedJob = async (
  companyId: number,
  ticketId: number
): Promise<void> => {
  const queue = getAiInboundQueue();
  const jobId = debounceJobId(ticketId);
  const existingJob = await queue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "delayed" || state === "waiting") {
      await existingJob.remove();
    }
  }

  await queue.add(
    "ProcessTicket",
    { companyId, ticketId },
    {
      jobId,
      delay: getDebounceMs(),
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: getMaxAttempts(),
      backoff: {
        type: "exponential",
        delay: parsePositiveInt(process.env.AI_QUEUE_BACKOFF_MS, 3000)
      }
    }
  );
};

export const enqueueAiInboundMessage = async (
  payload: Omit<AiInboundPayload, "enqueuedAt">
): Promise<boolean> => {
  if (!isAiFeaturesEnabled()) {
    logger.warn(
      { ticketId: payload.ticketId, companyId: payload.companyId },
      "AI inbound message ignored because AI features are disabled"
    );
    await persistAiDecisionLog({
      companyId: payload.companyId,
      ticketId: payload.ticketId,
      messageId: payload.messageId,
      action: "enqueue_skipped",
      reason: "ai_features_disabled"
    });
    return false;
  }

  const queue = getAiInboundQueue();
  const redis = queue.client;
  const fullPayload: AiInboundPayload = {
    ...payload,
    enqueuedAt: new Date().toISOString()
  };

  await redis.rpush(bufferKey(payload.ticketId), JSON.stringify(fullPayload));

  const isProcessing = await redis.exists(lockKey(payload.ticketId));
  if (isProcessing) {
    await scheduleDebouncedJob(payload.companyId, payload.ticketId);
    return true;
  }

  const ticket = await Ticket.findByPk(payload.ticketId);
  const agent = ticket
    ? await getActiveAgent(payload.companyId, ticket.queueId)
    : null;

  if (ticket && agent) {
    await sendOptionalAck(ticket, agent, payload.ticketId);
  }

  await scheduleDebouncedJob(payload.companyId, payload.ticketId);

  await persistAiDecisionLog({
    companyId: payload.companyId,
    ticketId: payload.ticketId,
    messageId: payload.messageId,
    action: "enqueue",
    reason: "message_buffered_for_processing",
    details: {
      mediaType: payload.mediaType || "text",
      hasMedia: Boolean(payload.mediaUrl)
    },
    userMessage: payload.messageBody
  });

  return true;
};

const rescheduleIfBuffered = async (
  companyId: number,
  ticketId: number
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  const pending = await redis.llen(bufferKey(ticketId));
  if (pending > 0) {
    await scheduleDebouncedJob(companyId, ticketId);
  }
};

export const handleAiInboundJob = async (job: Job<AiInboundJobData>) => {
  const { companyId, ticketId } = job.data;
  const queue = getAiInboundQueue();
  const redis = queue.client;
  const lockTtlSeconds = parsePositiveInt(
    process.env.AI_QUEUE_LOCK_TTL_SEC,
    300
  );

  await recordAiJobStarted(job);

  let ownsLock = false;

  try {
    const lockAcquired = await redis.set(
      lockKey(ticketId),
      String(job.id),
      "EX",
      lockTtlSeconds,
      "NX"
    );

    if (lockAcquired !== "OK") {
      await persistAiDecisionLog({
        companyId,
        ticketId,
        action: "job_cancelled",
        reason: "lock_not_acquired"
      });
      await recordAiJobCompleted(job, "cancelled");
      return;
    }

    ownsLock = true;

    const revalidated = await revalidateTicketForAi(ticketId, companyId);
    if (!revalidated) {
      await redis.del(bufferKey(ticketId));
      await persistAiDecisionLog({
        companyId,
        ticketId,
        action: "job_cancelled",
        reason: "ticket_no_longer_eligible_for_ai"
      });
      await recordAiJobCompleted(job, "cancelled");
      return;
    }

    const payloads = await drainBufferedMessages(ticketId);
    if (!payloads.length) {
      await persistAiDecisionLog({
        companyId,
        ticketId,
        action: "job_cancelled",
        reason: "empty_buffer"
      });
      await recordAiJobCompleted(job, "cancelled");
      return;
    }

    await persistAiDecisionLog({
      companyId,
      ticketId,
      action: "job_started",
      reason: "processing_buffered_messages",
      details: { messageCount: payloads.length }
    });

    await ProcessInboundMessageService({
      ticket: revalidated.ticket,
      companyId,
      agent: revalidated.agent,
      messages: payloads.map(mapPayloadToInboundItem)
    });

    await recordAiJobCompleted(job, "completed");
    await rescheduleIfBuffered(companyId, ticketId);
  } catch (error) {
    if (isTransientAiError(error) && job.attemptsMade < getMaxAttempts()) {
      throw error;
    }

    logger.error(
      { error, ticketId, companyId, attemptsMade: job.attemptsMade },
      "AI inbound job failed with definitive error"
    );

    await persistAiDecisionLog({
      companyId,
      ticketId,
      action: "job_failed",
      reason: error instanceof Error ? error.message : "ai_queue_error",
      details: { attemptsMade: job.attemptsMade }
    });

    try {
      const revalidated = await revalidateTicketForAi(ticketId, companyId);
      if (revalidated) {
        const payloads = await drainBufferedMessages(ticketId);
        if (payloads.length) {
          await ProcessInboundMessageService({
            ticket: revalidated.ticket,
            companyId,
            agent: revalidated.agent,
            messages: payloads.map(mapPayloadToInboundItem),
            forceHandoff: true,
            handoffReason:
              error instanceof Error ? error.message : "ai_queue_error"
          });
        }
      }
    } catch (handoffError) {
      logger.error(
        { handoffError, ticketId },
        "Failed to hand off after definitive AI queue error"
      );
    }

    await recordAiJobCompleted(job, "failed");
  } finally {
    if (ownsLock) {
      await redis.del(lockKey(ticketId));
    }
  }
};

export const startAiInboundQueue = (): void => {
  const queue = getAiInboundQueue();
  const concurrency = parsePositiveInt(process.env.AI_QUEUE_CONCURRENCY, 5);

  queue.process("ProcessTicket", concurrency, handleAiInboundJob);

  queue.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, ticketId: job?.data?.ticketId, error },
      "AI inbound queue job failed"
    );
  });

  logger.info(
    { concurrency, debounceMs: getDebounceMs() },
    "AI inbound queue processor started"
  );
};
