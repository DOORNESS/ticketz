import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiConversationLog from "../../models/AiConversationLog";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import { logger } from "../../utils/logger";

type HandoffParams = {
  ticket: Ticket;
  agent: AiAgent;
  userMessage: string;
  messageId?: string;
  reason?: string;
  usedChunks?: unknown;
  model?: string;
};

const HandoffToHumanService = async ({
  ticket,
  agent,
  userMessage,
  messageId,
  reason,
  usedChunks,
  model
}: HandoffParams): Promise<Ticket> => {
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
      queueId: agent.fallbackQueueId || ticket.queueId,
      aiAgentId: agent.id
    }
  });

  await AiConversationLog.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    messageId,
    direction: "outbound",
    userMessage,
    aiResponse: handoffMessage,
    usedChunks: usedChunks || null,
    model: model || agent.textModel,
    transferredToHuman: true,
    error: reason || null
  });

  return ticket.reload();
};

export default HandoffToHumanService;
