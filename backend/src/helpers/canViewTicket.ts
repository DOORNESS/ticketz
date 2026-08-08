import Ticket from "../models/Ticket";
import User from "../models/User";
import { isAiHandlingTicket } from "../services/AiServices/AiHelpers";
import { isHandoffPendingTicketState } from "./assertCanAcceptTicket";

/**
 * Marca é um gate que vem ANTES de qualquer regra de fila ou posse.
 *
 * Mora aqui de propósito: `canViewTicket` já é o ponto único usado por
 * socket, controller de ticket, mídia e aceite. Colocar a checagem em cada
 * chamador convidaria a esquecer um. As marcas chegam em `user.brands`,
 * carregadas por `ShowUserService` do mesmo jeito que `user.queues`.
 */
export const userCanSeeTicketBrand = (ticket: Ticket, user: User): boolean => {
  if (user.profile === "admin" || user.super) {
    return true;
  }

  const allowed = (user.brands || []).map(brand => Number(brand.id));

  // Sem vínculo, o comportamento depende do Setting `brandIsolationEnforced`:
  // desligado (padrão) mantém o acesso legado durante a transição; ligado, a
  // ausência de configuração vira ausência de acesso — o estado final.
  if (!allowed.length) {
    return user.brandIsolationEnforced !== true;
  }

  if (!ticket.brandId) {
    return false;
  }

  return allowed.includes(Number(ticket.brandId));
};

export const canViewTicket = (ticket: Ticket, user: User): boolean => {
  if (!userCanSeeTicketBrand(ticket, user)) {
    return false;
  }

  if (user.profile === "admin" || user.super) {
    return true;
  }

  const userId = Number(user.id);
  const queueIds = (user.queues || []).map(queue => Number(queue.id));

  if (ticket.userId && Number(ticket.userId) === userId) {
    return true;
  }

  if (isHandoffPendingTicketState(ticket)) {
    return true;
  }

  if (isAiHandlingTicket(ticket)) {
    return true;
  }

  if (ticket.status === "pending" && !ticket.userId) {
    if (!ticket.queueId) {
      return false;
    }
    return queueIds.includes(Number(ticket.queueId));
  }

  if (ticket.status === "closed") {
    return true;
  }

  if (
    ticket.status === "open" &&
    ticket.queueId &&
    queueIds.includes(Number(ticket.queueId))
  ) {
    return true;
  }

  return false;
};

export default canViewTicket;
