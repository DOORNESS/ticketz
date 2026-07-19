import Ticket from "../models/Ticket";
import User from "../models/User";

const canAccessTicketAiData = (ticket: Ticket, user: User): boolean => {
  if (user.profile === "admin" || user.super) {
    return true;
  }

  const userId = Number(user.id);
  const ticketUserId = ticket.userId ? Number(ticket.userId) : null;

  if (ticketUserId && ticketUserId === userId) {
    return true;
  }

  return !ticketUserId && Boolean(ticket.aiAgentId || ticket.aiHandoff);
};

export default canAccessTicketAiData;
