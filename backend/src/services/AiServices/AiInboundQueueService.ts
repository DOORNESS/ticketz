import Queue, { Job } from "bull";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import AiAgent from "../../models/AiAgent";
import { logger } from "../../utils/logger";
import {
  resolveProcessingAgent,
  canAiEngageTicket,
  ensureTicketQueueFromWhatsapp
} from "./AiHelpers";
import ProcessInboundMessageService, {
  InboundMessageItem,
  sendAiCustomerFallback
} from "./ProcessInboundMessageService";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { isTransientAiError, isPermanentAiError } from "./isTransientAiError";
import {
  registerTicketFailure,
  clearTicketFailures,
  hasExhaustedTicketFailures,
  getMaxTicketFailures
} from "./AiTicketFailureBreaker";
import HandoffToHumanService from "./HandoffToHumanService";
import { AI_HANDOFF_REASONS } from "./AiOperationalTypes";
import { isInformationalIntent } from "./Triage/CaseCompletenessEngine";
import {
  recordAiJobCompleted,
  recordAiJobStarted
} from "./AiQueueMetricsService";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import { isRemovableDebounceJobState } from "./AiInboundQueueJobState";
import { waitForInboundBufferQuietPeriod } from "./AiInboundBufferCoalesce";

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
  parsePositiveInt(process.env.AI_QUEUE_DEBOUNCE_MS, 1200);

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

const requeueBufferedMessages = async (
  ticketId: number,
  payloads: AiInboundPayload[]
): Promise<void> => {
  if (!payloads.length) {
    return;
  }

  const redis = getAiInboundQueue().client;
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    await redis.lpush(bufferKey(ticketId), JSON.stringify(payloads[index]));
  }
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

  if (!canAiEngageTicket(ticket)) {
    return null;
  }

  const agent = await resolveProcessingAgent(ticket);
  if (!agent?.active) {
    return null;
  }

  return { ticket, agent };
};

const revalidateTicketForAiWithRepair = async (
  ticketId: number,
  companyId: number
): Promise<{ ticket: Ticket; agent: AiAgent } | null> => {
  const initial = await revalidateTicketForAi(ticketId, companyId);
  if (initial) {
    return initial;
  }

  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    include: ["contact"]
  });

  if (!ticket || !canAiEngageTicket(ticket)) {
    return null;
  }

  await ensureTicketQueueFromWhatsapp(ticket);
  await ticket.reload({ include: ["contact"] });

  return revalidateTicketForAi(ticketId, companyId);
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
  ticketId: number,
  forceNewJob = false
): Promise<void> => {
  const queue = getAiInboundQueue();
  const jobId = forceNewJob ? undefined : debounceJobId(ticketId);
  const existingJob = jobId ? await queue.getJob(jobId) : null;

  if (existingJob) {
    const state = await existingJob.getState();
    if (isRemovableDebounceJobState(state)) {
      await existingJob.remove();
      logger.debug(
        { companyId, ticketId, queueId: jobId, state },
        "Removed existing AI debounce job before scheduling"
      );
    }
  }

  await queue.add(
    "ProcessTicket",
    { companyId, ticketId },
    {
      ...(jobId ? { jobId } : {}),
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

const getLockTtlSeconds = (): number =>
  parsePositiveInt(process.env.AI_QUEUE_LOCK_TTL_SEC, 120);

const getLockRetryMs = (): number =>
  parsePositiveInt(process.env.AI_QUEUE_LOCK_RETRY_MS, 100);

const AI_INFORMATIONAL_FALLBACK =
  "Estou consultando nossa base de conhecimento. Pode repetir sua pergunta em outras palavras?";

const AI_CUSTOMER_FALLBACK =
  "Ainda não encontrei uma resposta completa na base. Pode me contar um pouco mais o que você precisa?";

const TRANSIENT_ERROR_FALLBACK =
  "Desculpe, tive uma instabilidade momentânea. Pode repetir sua pergunta?";

const sendTransientQueueFallback = async ({
  ticket,
  companyId,
  payloads
}: {
  ticket: Ticket;
  companyId: number;
  payloads: AiInboundPayload[];
}): Promise<void> => {
  const userText = payloads
    .map(item => item.messageBody?.trim())
    .filter(Boolean)
    .join("\n");

  if (!userText) {
    return;
  }

  const messageId = payloads.find(item => item.messageId)?.messageId;

  await sendAiCustomerFallback({
    ticket,
    companyId,
    messageId,
    reason: "transient_provider_error_fallback",
    userText,
    body: isInformationalIntent(userText)
      ? AI_INFORMATIONAL_FALLBACK
      : TRANSIENT_ERROR_FALLBACK
  });
};

const clearStaleAiLockIfNeeded = async (
  ticketId: number,
  redis: ReturnType<typeof getAiInboundQueue>["client"]
): Promise<boolean> => {
  const key = lockKey(ticketId);
  if (!(await redis.exists(key))) {
    return false;
  }

  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    await redis.del(key);
    return true;
  }

  const stalledMs = Date.now() - new Date(ticket.updatedAt).getTime();
  const processingState = (ticket as { aiProcessingState?: string })
    .aiProcessingState;

  if (processingState === "processing" && stalledMs > 25000) {
    await redis.del(key);
    await ticket.update({ aiProcessingState: "awaiting_customer" } as never);
    return true;
  }

  if (processingState === "processing" && stalledMs > 12000) {
    await redis.del(key);
    return true;
  }

  const ttl = await redis.ttl(key);
  if (ttl === -1) {
    await redis.del(key);
    return true;
  }

  return false;
};

const usesImmediateProcessing = (): boolean => getDebounceMs() === 0;

const rescheduleIfBuffered = async (
  companyId: number,
  ticketId: number,
  currentJob?: Job<AiInboundJobData>
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  const pending = await redis.llen(bufferKey(ticketId));
  if (pending > 0) {
    if (usesImmediateProcessing()) {
      void processBufferedAiInbound(companyId, ticketId).catch(error => {
        logger.error(
          { error, ticketId, companyId },
          "Immediate AI follow-up processing failed"
        );
      });
      return;
    }

    // `forceNewJob` só é aceitável quando o turno terminou bem: aí o job novo
    // representa mensagens novas do cliente. No caminho de erro ele criava uma
    // linhagem de job com orçamento de tentativas zerado, e o teto do Bull
    // nunca era alcançado.
    await scheduleDebouncedJob(companyId, ticketId, Boolean(currentJob));
  }
};

/** Remove o job de debounce pendente do ticket, se houver. */
const removePendingDebounceJob = async (ticketId: number): Promise<void> => {
  try {
    const job = await getAiInboundQueue().getJob(debounceJobId(ticketId));
    if (job) {
      const state = await job.getState();
      if (isRemovableDebounceJobState(state)) {
        await job.remove();
      }
    }
  } catch (error) {
    logger.warn(
      { error, ticketId },
      "Failed to remove pending AI debounce job"
    );
  }
};

/**
 * Última parada quando a IA não consegue mais atender o ticket.
 *
 * Repetir a mesma frase é o pior desfecho possível: o cliente conclui que
 * ninguém está lendo. Aqui o ticket passa para uma pessoa, com o motivo
 * técnico registrado no log de decisões para quem for investigar depois.
 */
const escalateAfterExhaustedFailures = async ({
  companyId,
  ticketId,
  reason,
  errorMessage
}: {
  companyId: number;
  ticketId: number;
  reason: string;
  errorMessage: string;
}): Promise<void> => {
  try {
    const revalidated = await revalidateTicketForAi(ticketId, companyId);
    if (!revalidated) {
      return;
    }

    const lastInbound = await Message.findOne({
      where: { ticketId, fromMe: false },
      order: [["createdAt", "DESC"]]
    });

    await HandoffToHumanService({
      ticket: revalidated.ticket,
      agent: revalidated.agent,
      userMessage: lastInbound?.body || "",
      messageId: lastInbound?.id,
      handoffReason: AI_HANDOFF_REASONS.provider_error,
      reason
    });

    await persistAiDecisionLog({
      companyId,
      ticketId,
      action: "handoff",
      reason,
      details: {
        error: errorMessage.slice(0, 300),
        maxConsecutiveFailures: getMaxTicketFailures()
      }
    });
  } catch (error) {
    logger.error(
      { error, ticketId, companyId, reason },
      "Failed to escalate ticket to a human after exhausted AI failures"
    );
  }
};

export const processBufferedAiInbound = async (
  companyId: number,
  ticketId: number,
  job?: Job<AiInboundJobData>
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  const lockTtlSeconds = getLockTtlSeconds();
  let ownsLock = false;
  let turnFailed = false;
  let drainedPayloads: AiInboundPayload[] = [];

  if (job) {
    await recordAiJobStarted(job);
  }

  try {
    const lockAcquired = await redis.set(
      lockKey(ticketId),
      job ? String(job.id) : "inline",
      "EX",
      lockTtlSeconds,
      "NX"
    );

    if (lockAcquired !== "OK") {
      const clearedStaleLock = await clearStaleAiLockIfNeeded(ticketId, redis);
      if (clearedStaleLock) {
        const retryLock = await redis.set(
          lockKey(ticketId),
          job ? String(job.id) : "inline",
          "EX",
          lockTtlSeconds,
          "NX"
        );
        if (retryLock === "OK") {
          ownsLock = true;
        }
      }

      if (!ownsLock) {
        if (job) {
          await recordAiJobCompleted(job, "cancelled");
        }

        logger.debug(
          { companyId, ticketId, jobId: job?.id },
          "AI processing skipped because another worker owns the ticket lock"
        );
        return;
      }
    } else {
      ownsLock = true;
    }

    if (!ownsLock) {
      return;
    }

    if (!usesImmediateProcessing()) {
      await waitForInboundBufferQuietPeriod(
        () => redis.llen(bufferKey(ticketId)),
        getDebounceMs()
      );
    }

    const revalidated = await revalidateTicketForAiWithRepair(
      ticketId,
      companyId
    );
    if (!revalidated) {
      const pendingCount = await redis.llen(bufferKey(ticketId));
      await redis.del(bufferKey(ticketId));
      logger.info(
        { ticketId, companyId, discardedPayloads: pendingCount },
        "AI inbound buffer cleared because ticket is no longer eligible"
      );
      if (job) {
        await persistAiDecisionLog({
          companyId,
          ticketId,
          action: "job_cancelled",
          reason: "ticket_no_longer_eligible_for_ai"
        });
        await recordAiJobCompleted(job, "cancelled");
      }
      return;
    }

    drainedPayloads = await drainBufferedMessages(ticketId);
    if (!drainedPayloads.length) {
      if (job) {
        await persistAiDecisionLog({
          companyId,
          ticketId,
          action: "job_cancelled",
          reason: "empty_buffer"
        });
        await recordAiJobCompleted(job, "cancelled");
      }
      return;
    }

    await persistAiDecisionLog({
      companyId,
      ticketId,
      action: "job_started",
      reason: job ? "processing_buffered_messages" : "immediate_processing",
      details: { messageCount: drainedPayloads.length, immediate: !job }
    });

    await ProcessInboundMessageService({
      ticket: revalidated.ticket,
      companyId,
      agent: revalidated.agent,
      messages: drainedPayloads.map(mapPayloadToInboundItem)
    });

    drainedPayloads = [];
    await clearTicketFailures(redis, ticketId);

    if (job) {
      await recordAiJobCompleted(job, "completed");
    }
  } catch (error) {
    turnFailed = true;
    if (drainedPayloads.length) {
      await requeueBufferedMessages(ticketId, drainedPayloads);
      drainedPayloads = [];
    }

    const permanent = isPermanentAiError(error);
    const failures = await registerTicketFailure(redis, ticketId);
    const exhausted = permanent || hasExhaustedTicketFailures(failures);
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error || "ai_queue_error");

    // O erro do provedor precisa aparecer JÁ na primeira falha. Antes ele só
    // era registrado depois do `throw`, que nunca acontecia — o painel via
    // milhares de `job_started` e nenhum motivo.
    await persistAiDecisionLog({
      companyId,
      ticketId,
      action: "job_failed",
      reason: errorMessage.slice(0, 300),
      details: {
        attemptsMade: job?.attemptsMade || 0,
        immediate: !job,
        consecutiveFailures: failures,
        permanent,
        transient: isTransientAiError(error)
      }
    });

    if (exhausted) {
      // Fim de linha: descarta o que ficou no buffer para nenhum job novo
      // nascer dele, e entrega o ticket a uma pessoa.
      await redis.del(bufferKey(ticketId));
      await removePendingDebounceJob(ticketId);
      logger.error(
        {
          error,
          ticketId,
          companyId,
          consecutiveFailures: failures,
          permanent
        },
        permanent
          ? "AI inbound processing hit a permanent provider error — escalating"
          : "AI inbound processing exhausted the ticket failure budget — escalating"
      );
      await escalateAfterExhaustedFailures({
        companyId,
        ticketId,
        reason: permanent
          ? "provider_error_permanent"
          : "ai_failure_streak_exhausted",
        errorMessage
      });
      if (job) {
        await recordAiJobCompleted(job, "failed");
      }
      return;
    }

    if (
      job &&
      isTransientAiError(error) &&
      job.attemptsMade + 1 < getMaxAttempts()
    ) {
      // `attemptsMade` já foi incrementado pelo Bull quando este handler roda,
      // então comparar com o teto direto deixava a última tentativa passar
      // como se ainda houvesse orçamento — e o ramo de desistência abaixo
      // nunca era alcançado.
      throw error;
    }

    logger.error(
      {
        error,
        ticketId,
        companyId,
        attemptsMade: job?.attemptsMade,
        consecutiveFailures: failures
      },
      "AI inbound processing failed with definitive error"
    );

    if (!job && isTransientAiError(error)) {
      const retryKey = `ai:inline-retry:${ticketId}`;
      const retries = await redis.incr(retryKey);
      await redis.expire(retryKey, 300);

      if (retries < getMaxAttempts()) {
        setTimeout(() => {
          void processBufferedAiInbound(companyId, ticketId).catch(
            retryError => {
              logger.error(
                { retryError, ticketId, companyId },
                "Retry after transient AI processing error failed"
              );
            }
          );
        }, getLockRetryMs());
      } else {
        await redis.del(retryKey);
        try {
          const revalidated = await revalidateTicketForAi(ticketId, companyId);
          if (revalidated) {
            const payloads = await drainBufferedMessages(ticketId);
            if (payloads.length) {
              await sendTransientQueueFallback({
                ticket: revalidated.ticket,
                companyId,
                payloads
              });
            }
          }
        } catch (fallbackError) {
          logger.error(
            { fallbackError, ticketId },
            "Failed to send transient AI fallback after inline retries"
          );
        }
      }
    } else if (isTransientAiError(error)) {
      try {
        const revalidated = await revalidateTicketForAi(ticketId, companyId);
        if (revalidated) {
          const payloads = await drainBufferedMessages(ticketId);
          if (payloads.length) {
            await sendTransientQueueFallback({
              ticket: revalidated.ticket,
              companyId,
              payloads
            });
          }
        }
      } catch (fallbackError) {
        logger.error(
          { fallbackError, ticketId },
          "Failed to send transient AI fallback after queue exhaustion"
        );
      }
    } else {
      try {
        const revalidated = await revalidateTicketForAi(ticketId, companyId);
        if (revalidated) {
          const payloads = await drainBufferedMessages(ticketId);
          if (payloads.length) {
            const userText = payloads
              .map(item => item.messageBody?.trim())
              .filter(Boolean)
              .join("\n");
            if (userText) {
              await sendAiCustomerFallback({
                ticket: revalidated.ticket,
                companyId,
                messageId: payloads.find(item => item.messageId)?.messageId,
                reason: "queue_definitive_error_fallback",
                userText,
                body: AI_CUSTOMER_FALLBACK
              });
            }
          }
        }
      } catch (fallbackError) {
        logger.error(
          { fallbackError, ticketId },
          "Failed to send fallback after definitive AI queue error"
        );
      }
    }

    if (job) {
      await recordAiJobCompleted(job, "failed");
    }
  } finally {
    if (ownsLock) {
      await redis.del(lockKey(ticketId));
    }

    // Only the lock owner may schedule the next buffered turn. Contending
    // workers must leave this responsibility to the owner; otherwise every
    // collision creates another job and an unbounded retry storm.
    // Um turno que falhou não gera trabalho novo: o Bull já cuida da
    // retentativa dentro do mesmo job, e o disjuntor decide quando parar.
    if (ownsLock && !turnFailed) {
      await rescheduleIfBuffered(companyId, ticketId, job);
    }
  }
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
    if (usesImmediateProcessing()) {
      setTimeout(() => {
        void processBufferedAiInbound(
          payload.companyId,
          payload.ticketId
        ).catch(error => {
          logger.error(
            { error, ticketId: payload.ticketId, companyId: payload.companyId },
            "Deferred immediate AI processing failed"
          );
        });
      }, getLockRetryMs());
    } else {
      await scheduleDebouncedJob(payload.companyId, payload.ticketId);
    }
    return true;
  }

  if (usesImmediateProcessing()) {
    await persistAiDecisionLog({
      companyId: payload.companyId,
      ticketId: payload.ticketId,
      messageId: payload.messageId,
      action: "enqueue",
      reason: "immediate_processing_started",
      details: {
        mediaType: payload.mediaType || "text",
        hasMedia: Boolean(payload.mediaUrl)
      },
      userMessage: payload.messageBody
    });

    void processBufferedAiInbound(payload.companyId, payload.ticketId).catch(
      error => {
        logger.error(
          { error, ticketId: payload.ticketId, companyId: payload.companyId },
          "Immediate AI processing failed"
        );
      }
    );

    return true;
  }

  const ticket = await Ticket.findByPk(payload.ticketId);
  const agent = ticket ? await resolveProcessingAgent(ticket) : null;

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

export const handleAiInboundJob = async (
  job: Job<AiInboundJobData>
): Promise<void> => {
  const { companyId, ticketId } = job.data;
  await processBufferedAiInbound(companyId, ticketId, job);
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
