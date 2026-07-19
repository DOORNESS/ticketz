import Ticket from "../../models/Ticket";
import User from "../../models/User";
import ShowTicketService from "./ShowTicketService";
import UpdateTicketService from "./UpdateTicketService";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

type ReopenParams = {
  ticketId: number;
  user: User;
  releaseToAi?: boolean;
};

const resolveConflictingTicket = async (
  ticket: Ticket,
  user: User
): Promise<void> => {
  const conflicting = await CheckContactOpenTickets(
    ticket.contactId,
    ticket.whatsappId,
    true,
    ticket.id
  );

  if (!conflicting || conflicting.id === ticket.id) {
    return;
  }

  logger.warn(
    {
      ticketId: ticket.id,
      conflictingTicketId: conflicting.id,
      contactId: ticket.contactId
    },
    "Closing conflicting open ticket before manual reopen"
  );

  await UpdateTicketService({
    ticketId: conflicting.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: {
      status: "closed",
      justClose: true,
      userId: user.id
    }
  });
};

const buildAiReopenData = (ticket: Ticket): Record<string, unknown> => {
  const disableBot = ticket.contact?.disableBot === true;
  const waitingForHuman = Boolean(ticket.aiHandoff && !ticket.aiPaused);
  const canReengageAi =
    Boolean(ticket.aiAgentId) &&
    !ticket.aiPaused &&
    !disableBot &&
    !waitingForHuman;

  const base = {
    aiResolvedByAi: false,
    aiEndedAt: null,
    userId: null
  };

  if (canReengageAi) {
    return {
      ...base,
      status: "pending",
      aiHandoff: false,
      aiHandoffReason: null,
      aiHandoffAt: null,
      aiWaitingSince: null,
      aiHumanAssumedAt: null,
      aiHumanAssumedBy: null,
      aiProcessingState: "ai_active",
      aiPaused: false
    };
  }

  if (waitingForHuman || ticket.aiHandoff) {
    return {
      ...base,
      status: "pending",
      aiWaitingSince: new Date(),
      aiProcessingState: "awaiting_human"
    };
  }

  if (ticket.aiAgentId) {
    return {
      ...base,
      status: "pending",
      aiHandoff: false,
      aiPaused: false,
      aiProcessingState: "ai_active"
    };
  }

  return {
    ...base,
    status: "pending"
  };
};

export const reopenClosedTicketManually = async ({
  ticketId,
  user,
  releaseToAi = false
}: ReopenParams): Promise<{
  ticket: Ticket;
  alreadyOpen?: boolean;
  releasedToAi?: boolean;
}> => {
  const ticket = await ShowTicketService(ticketId, user.companyId);

  if (ticket.status !== "closed") {
    return { ticket, alreadyOpen: true };
  }

  await resolveConflictingTicket(ticket, user);

  if (releaseToAi) {
    const { ticket: updated } = await UpdateTicketService({
      ticketId: ticket.id,
      reqUserId: user.id,
      companyId: user.companyId,
      ticketData: buildAiReopenData(ticket) as any
    });
    return { ticket: updated, releasedToAi: true };
  }

  const { ticket: updated } = await UpdateTicketService({
    ticketId: ticket.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: {
      status: "open",
      userId: user.id,
      aiResolvedByAi: false,
      aiEndedAt: null
    }
  });

  return { ticket: updated };
};

export default reopenClosedTicketManually;
