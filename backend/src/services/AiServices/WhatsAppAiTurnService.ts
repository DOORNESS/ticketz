import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import Message from "../../models/Message";
import AppError from "../../errors/AppError";
import { deliverAiReply } from "./sendAiWhatsAppReply";
import { tryInformationalDirectReply } from "./InformationalDirectReplyService";
import { prepareCustomerFacingAiText } from "./prepareCustomerFacingAiText";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import { finalizeAiResponse } from "./Triage/TriageOrchestratorService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import {
  buildTimeBasedGreeting,
  isInformationalIntent,
  isPureGreetingMessage
} from "./Triage/CaseCompletenessEngine";
import { findUnansweredCustomerQuestion } from "./WhatsAppCustomerTurnResolver";
import { logger } from "../../utils/logger";
import { parsePositiveInt, withAiTimeout } from "./withAiTimeout";

const getWhatsAppTurnTimeoutMs = (): number =>
  parsePositiveInt(process.env.AI_WHATSAPP_TURN_TIMEOUT_MS, 25000);

export type WhatsAppTurnInput = {
  companyId: number;
  ticket: Ticket;
  agent: AiAgent;
  userText: string;
  messageId?: string;
  markSent?: () => void;
};

const NIVEL_INFORMATIONAL_FALLBACK =
  "A Nível Cashback ajuda sua empresa a fidelizar clientes com cashback em cada compra — o cliente acumula saldo e volta a gastar com você. Posso detalhar benefícios para lojistas, como funciona para o cliente final, ou como começar.";

const GENERIC_FALLBACK =
  "Entendi sua mensagem. Pode me contar um pouco mais do que você precisa que eu te ajudo com o máximo de detalhes possível.";

const alreadyBotGreeted = async (ticketId: number): Promise<boolean> => {
  const lastOutbound = await Message.findOne({
    where: { ticketId, fromMe: true },
    order: [["createdAt", "DESC"]],
    attributes: ["body"]
  });

  const body = (lastOutbound?.body || "").toLowerCase();
  return (
    body.includes("nivelton") ||
    body.includes("como posso ajudar") ||
    body.includes("em que posso ajudar") ||
    body.includes("nível cashback") ||
    body.includes("nivel cashback")
  );
};

export const buildFastGreetingReply = async (
  ticketId: number
): Promise<string> => {
  const greeted = await alreadyBotGreeted(ticketId);
  const salutation = buildTimeBasedGreeting();

  if (greeted) {
    return `${salutation} Qual é sua dúvida? Posso explicar como a Nível Cashback funciona para sua empresa.`;
  }

  return `Me chamo Nivelton, assistente da Nível Cashback. ${salutation} Como posso ajudar você hoje?`;
};

const maskForLog = (text: string): string =>
  text.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]");

const completeTurnDelivery = async ({
  companyId,
  ticket,
  messageId,
  userText,
  replyBody,
  reason,
  markSent,
  details
}: {
  companyId: number;
  ticket: Ticket;
  messageId?: string;
  userText: string;
  replyBody: string;
  reason: string;
  markSent?: () => void;
  details?: Record<string, unknown>;
}): Promise<void> => {
  let delivered = false;

  try {
    delivered = await deliverAiReply(ticket, replyBody);
    if (!delivered) {
      throw new AppError("ERR_SENDING_WAPP_MSG", 400);
    }
    markSent?.();
  } finally {
    try {
      await finalizeAiResponse(ticket, messageId);
    } catch (finalizeError) {
      logger.warn(
        { finalizeError, ticketId: ticket.id },
        "Failed to finalize AI state after WhatsApp turn"
      );
    }
  }

  if (!delivered) {
    throw new AppError("ERR_SENDING_WAPP_MSG", 400);
  }

  await ticket.reload({
    include: ["contact", "queue", "whatsapp", "user"]
  });
  websocketUpdateTicket(ticket);
  await persistAiDecisionLog({
    companyId,
    ticketId: ticket.id,
    messageId,
    action: "respond",
    reason,
    userMessage: maskForLog(userText),
    aiResponse: replyBody,
    details
  });
};

/**
 * Caminho principal WhatsApp: saudação rápida ou resposta informativa direta.
 * Sempre tenta enviar algo útil ao cliente.
 */
export const runWhatsAppAiTurn = async ({
  companyId,
  ticket,
  agent,
  userText,
  messageId,
  markSent
}: WhatsAppTurnInput): Promise<"greeting" | "informational" | "skipped"> => {
  const trimmed = userText.trim();
  if (!trimmed) {
    return "skipped";
  }

  const unanswered = await findUnansweredCustomerQuestion(ticket.id);
  const pureGreeting =
    isPureGreetingMessage(trimmed) && !isInformationalIntent(trimmed);

  if (pureGreeting && !unanswered) {
    const greetingReply = await buildFastGreetingReply(ticket.id);
    await completeTurnDelivery({
      companyId,
      ticket,
      messageId,
      userText: trimmed,
      replyBody: greetingReply,
      reason: "fast_greeting_reply",
      markSent
    });
    return "greeting";
  }

  const direct = await withAiTimeout(
    tryInformationalDirectReply({
      companyId,
      ticket,
      agent,
      userText: trimmed
    }),
    getWhatsAppTurnTimeoutMs(),
    "whatsapp_informational_turn"
  ).catch(error => {
    logger.warn(
      { error, ticketId: ticket.id, companyId },
      "Informational WhatsApp turn timed out — using brand fallback"
    );

    return {
      replied: true,
      body: isInformationalIntent(trimmed)
        ? NIVEL_INFORMATIONAL_FALLBACK
        : GENERIC_FALLBACK,
      knowledgeBaseIds: [] as number[],
      chunkCount: 0,
      hasReadyDocuments: false,
      reason: "informational_brand_fallback" as const
    };
  });

  const replyBody =
    prepareCustomerFacingAiText(direct.body || "", trimmed) ||
    direct.body ||
    (isInformationalIntent(trimmed)
      ? NIVEL_INFORMATIONAL_FALLBACK
      : GENERIC_FALLBACK);

  await completeTurnDelivery({
    companyId,
    ticket,
    messageId,
    userText: trimmed,
    replyBody,
    reason: direct.reason || "whatsapp_ai_turn",
    markSent,
    details: {
      knowledgeBaseIds: direct.knowledgeBaseIds,
      chunks: direct.chunkCount,
      hadUnanswered: Boolean(unanswered)
    }
  });

  return "informational";
};
