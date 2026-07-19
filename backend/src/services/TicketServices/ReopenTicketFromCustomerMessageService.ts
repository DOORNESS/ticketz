import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import User from "../../models/User";
import UpdateTicketService, {
  websocketUpdateTicket
} from "./UpdateTicketService";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

const emitTicketReopenEvents = (ticket: Ticket): void => {
  const io = getIO();

  io.to(`company-${ticket.companyId}-closed`)
    .to(`queue-${ticket.queueId}-closed`)
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

  io.to(`company-${ticket.companyId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-notification`)
    .to(ticket.id.toString())
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};

/**
 * Reabre automaticamente ticket fechado quando o cliente envia nova mensagem.
 * Classifica para IA (aba IA) ou Aguardando (handoff humano).
 */
const ReopenTicketFromCustomerMessageService = async (
  ticket: Ticket
): Promise<Ticket | null> => {
  if (ticket.status !== "closed") {
    return null;
  }

  await ticket.reload({
    include: [
      { model: Contact, as: "contact" },
      { model: Queue, as: "queue" },
      { model: User, as: "user" }
    ]
  });

  const disableBot = ticket.contact?.disableBot === true;
  const waitingForHuman = Boolean(ticket.aiHandoff && !ticket.aiPaused);
  const canReengageAi =
    Boolean(ticket.aiAgentId) &&
    !ticket.aiPaused &&
    !disableBot &&
    !waitingForHuman;

  const ticketData: Record<string, unknown> = {
    status: "pending",
    userId: null,
    aiResolvedByAi: false,
    aiEndedAt: null
  };

  if (canReengageAi) {
    Object.assign(ticketData, {
      aiHandoff: false,
      aiHandoffReason: null,
      aiHandoffAt: null,
      aiWaitingSince: null,
      aiHumanAssumedAt: null,
      aiHumanAssumedBy: null,
      aiProcessingState: "ai_active",
      aiPaused: false
    });
  } else if (waitingForHuman) {
    Object.assign(ticketData, {
      aiWaitingSince: new Date(),
      aiProcessingState: "awaiting_human"
    });
  }

  try {
    const { ticket: updated } = await UpdateTicketService({
      ticketId: ticket.id,
      companyId: ticket.companyId,
      ticketData: ticketData as any,
      dontRunChatbot: true
    });

    await updated.reload({
      include: [
        { model: Contact, as: "contact" },
        { model: Queue, as: "queue" },
        { model: User, as: "user" }
      ]
    });

    emitTicketReopenEvents(updated);
    websocketUpdateTicket(updated);

    logger.info(
      {
        ticketId: updated.id,
        canReengageAi,
        waitingForHuman,
        aiHandoff: updated.aiHandoff,
        aiAgentId: updated.aiAgentId
      },
      "Ticket auto-reopened from customer inbound message"
    );

    return updated;
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id },
      "Failed to auto-reopen ticket from customer message"
    );
    throw error;
  }
};

export default ReopenTicketFromCustomerMessageService;
