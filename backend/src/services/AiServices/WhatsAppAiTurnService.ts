import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import Message from "../../models/Message";
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
    await deliverAiReply(ticket, greetingReply);
    markSent?.();
    await finalizeAiResponse(ticket, messageId);
    await ticket.reload({
      include: ["contact", "queue", "whatsapp", "user"]
    });
    websocketUpdateTicket(ticket);
    await persistAiDecisionLog({
      companyId,
      ticketId: ticket.id,
      messageId,
      action: "respond",
      reason: "fast_greeting_reply",
      userMessage: maskForLog(trimmed),
      aiResponse: greetingReply
    });
    return "greeting";
  }

  const direct = await tryInformationalDirectReply({
    companyId,
    ticket,
    agent,
    userText: trimmed
  });

  const replyBody =
    prepareCustomerFacingAiText(direct.body || "", trimmed) ||
    direct.body ||
    (isInformationalIntent(trimmed)
      ? NIVEL_INFORMATIONAL_FALLBACK
      : GENERIC_FALLBACK);

  await deliverAiReply(ticket, replyBody);
  markSent?.();
  await finalizeAiResponse(ticket, messageId);
  await ticket.reload({
    include: ["contact", "queue", "whatsapp", "user"]
  });
  websocketUpdateTicket(ticket);
  await persistAiDecisionLog({
    companyId,
    ticketId: ticket.id,
    messageId,
    action: "respond",
    reason: direct.reason || "whatsapp_ai_turn",
    userMessage: maskForLog(trimmed),
    aiResponse: replyBody,
    details: {
      knowledgeBaseIds: direct.knowledgeBaseIds,
      chunks: direct.chunkCount,
      hadUnanswered: Boolean(unanswered)
    }
  });

  return "informational";
};
