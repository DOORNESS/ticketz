import Ticket from "../models/Ticket";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";

export const isHumanHandlingTicket = (ticket: Ticket): boolean =>
  Boolean(ticket.userId && ticket.status === "open");

export const healHumanAssignedTicketStatus = async (
  ticket: Ticket
): Promise<Ticket> => {
  if (!ticket.userId || ticket.status !== "pending") {
    return ticket;
  }

  logger.warn(
    {
      ticketId: ticket.id,
      userId: ticket.userId,
      status: ticket.status
    },
    "Healing ticket with human assignee stuck in pending status"
  );

  await ticket.update({ status: "open" });
  await ticket.reload();

  const io = getIO();
  io.to(ticket.id.toString())
    .to(`company-${ticket.companyId}-open`)
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "update",
      ticket
    });

  return ticket;
};
