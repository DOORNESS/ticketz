import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { canAiEngageTicket } from "./AiHelpers";
import { getAiInboundQueue } from "./AiInboundQueueService";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import { logger } from "../../utils/logger";
import { splitDeferrableConfirmation } from "./AiDeferredQuestionRules";

const PENDING_KEY = (ticketId: number): string =>
  `ai:deferred-question:${ticketId}`;
const PENDING_INDEX = "ai:deferred-question:index";

export type DeferredQuestion = {
  companyId: number;
  ticketId: number;
  question: string;
  anchorAt: string;
  dueAt: number;
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getDeferredQuestionDelayMs = (): number =>
  parsePositiveInt(process.env.AI_DEFERRED_QUESTION_SECONDS, 60) * 1000;

export const isDeferredQuestionEnabled = (): boolean =>
  process.env.AI_DEFERRED_QUESTION_ENABLED !== "false";

export const scheduleDeferredQuestion = async ({
  companyId,
  ticketId,
  question
}: {
  companyId: number;
  ticketId: number;
  question: string;
}): Promise<void> => {
  const redis = getAiInboundQueue().client;
  const dueAt = Date.now() + getDeferredQuestionDelayMs();
  const payload: DeferredQuestion = {
    companyId,
    ticketId,
    question,
    anchorAt: new Date().toISOString(),
    dueAt
  };

  // A pergunta mais recente substitui qualquer pendência anterior do ticket.
  await redis.set(
    PENDING_KEY(ticketId),
    JSON.stringify(payload),
    "PX",
    getDeferredQuestionDelayMs() + 600000
  );
  await redis.zadd(PENDING_INDEX, String(dueAt), String(ticketId));

  logger.info(
    { ticketId, companyId, dueAt: new Date(dueAt).toISOString() },
    "AI confirmation question deferred"
  );
};

export const cancelDeferredQuestion = async (
  ticketId: number
): Promise<void> => {
  const redis = getAiInboundQueue().client;
  await redis.del(PENDING_KEY(ticketId));
  await redis.zrem(PENDING_INDEX, String(ticketId));
};

/**
 * Só entrega a pergunta se nada tiver acontecido no ticket desde a instrução:
 * qualquer mensagem nova — do cliente ou do atendimento — torna a cobrança
 * deslocada.
 */
export const shouldStillAskDeferredQuestion = async (
  pending: DeferredQuestion
): Promise<boolean> => {
  const ticket = await Ticket.findOne({
    where: { id: pending.ticketId, companyId: pending.companyId },
    include: ["contact"]
  });

  if (!ticket || !canAiEngageTicket(ticket)) {
    return false;
  }

  const laterMessage = await Message.findOne({
    where: {
      ticketId: pending.ticketId,
      createdAt: { [Op.gt]: new Date(pending.anchorAt) }
    },
    attributes: ["id", "fromMe"]
  });

  return !laterMessage;
};

export const runDeferredQuestionSweep = async (): Promise<void> => {
  if (!isDeferredQuestionEnabled()) {
    return;
  }

  const redis = getAiInboundQueue().client;
  const dueTicketIds = await redis.zrangebyscore(
    PENDING_INDEX,
    "-inf",
    String(Date.now())
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const rawTicketId of dueTicketIds) {
    const ticketId = Number(rawTicketId);
    try {
      const raw = await redis.get(PENDING_KEY(ticketId));
      await redis.zrem(PENDING_INDEX, rawTicketId);

      if (!raw) {
        continue;
      }

      await redis.del(PENDING_KEY(ticketId));
      const pending = JSON.parse(raw) as DeferredQuestion;

      if (!(await shouldStillAskDeferredQuestion(pending))) {
        logger.debug(
          { ticketId },
          "Deferred AI question dropped — conversation already moved on"
        );
        continue;
      }

      const ticket = await Ticket.findByPk(pending.ticketId);
      if (!ticket) {
        continue;
      }

      // Import tardio: sendAiWhatsAppReply importa este módulo para recortar a
      // pergunta, e o ciclo quebraria o carregamento.
      const { sendAiWhatsAppReply } = await import("./sendAiWhatsAppReply");
      await sendAiWhatsAppReply({
        ticket,
        body: pending.question,
        skipDuplicateCheck: true
      });

      await persistAiDecisionLog({
        companyId: pending.companyId,
        ticketId: pending.ticketId,
        action: "respond",
        reason: "deferred_confirmation_question",
        aiResponse: pending.question
      });

      logger.info(
        { ticketId, companyId: pending.companyId },
        "Deferred AI confirmation question delivered"
      );
    } catch (error) {
      logger.error(
        { error, ticketId },
        "Failed to deliver deferred AI question"
      );
    }
  }
};

export { splitDeferrableConfirmation };
export type { SplitResult } from "./AiDeferredQuestionRules";
