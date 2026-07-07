import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiConversationLog from "../../models/AiConversationLog";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import { logger } from "../../utils/logger";
import ResolveHandoffQueueService from "./ResolveHandoffQueueService";
import { persistAiDecisionLog } from "./AiDecisionLogger";

type HandoffParams = {
  ticket: Ticket;
  agent: AiAgent;
  userMessage: string;
  messageId?: string;
  reason?: string;
  usedChunks?: unknown;
  model?: string;
  conversationText?: string;
};

const HandoffToHumanService = async ({
  ticket,
  agent,
  userMessage,
  messageId,
  reason,
  usedChunks,
  model,
  conversationText
}: HandoffParams): Promise<Ticket> => {
  const routing = await ResolveHandoffQueueService({
    companyId: ticket.companyId,
    agent,
    conversationText: conversationText || userMessage,
    currentQueueId: ticket.queueId
  });

  const targetQueueId =
    routing.queueId > 0
      ? routing.queueId
      : agent.fallbackQueueId || ticket.queueId;

  const handoffMessage =
    agent.handoffMessage?.trim() ||
    "Vou transferir você para um atendente humano. Por favor, aguarde.";

  try {
    await SendWhatsAppMessage({
      body: formatBody(handoffMessage, ticket),
      ticket
    });
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id },
      "Failed to send handoff message"
    );
  }

  await UpdateTicketService({
    ticketId: ticket.id,
    companyId: ticket.companyId,
    ticketData: {
      aiHandoff: true,
      chatbot: false,
      status: "pending",
      queueId: targetQueueId,
      aiAgentId: agent.id
    }
  });

  const decisionDetails = {
    handoffReason: reason || null,
    routingMethod: routing.method,
    routingConfidence: routing.confidence,
    routingReason: routing.reason,
    targetQueueId,
    targetQueueName: routing.queueName,
    usedChunks: usedChunks || null
  };

  await AiConversationLog.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    messageId,
    direction: "outbound",
    userMessage,
    aiResponse: handoffMessage,
    usedChunks: decisionDetails,
    model: model || agent.textModel,
    transferredToHuman: true,
    error: reason || null
  });

  await persistAiDecisionLog({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    messageId,
    action: "handoff",
    reason: reason || "handoff",
    details: decisionDetails,
    userMessage,
    aiResponse: handoffMessage,
    transferredToHuman: true
  });

  return ticket.reload();
};

export default HandoffToHumanService;
