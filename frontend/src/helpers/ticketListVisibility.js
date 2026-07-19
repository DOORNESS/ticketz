import { isAiHandlingTicket, isHandoffPendingTicket } from "./aiTicketStatus";

export const ticketMatchesSelectedQueues = (
  ticket,
  selectedQueueIds = [],
  { supervision = false, listMode } = {}
) => {
  if (!ticket?.queueId) {
    if (isHandoffPendingTicket(ticket)) {
      return true;
    }
    return (supervision || listMode === "ai") && isAiHandlingTicket(ticket);
  }

  if (!selectedQueueIds?.length) {
    return true;
  }

  return selectedQueueIds.includes(ticket.queueId);
};

export const shouldShowTicketInList = ({
  ticket,
  status,
  supervision,
  listMode,
  selectedQueueIds,
  profile,
  showAll,
  userId
}) => {
  if (!ticket) {
    return false;
  }

  if (listMode === "ai") {
    if (!isAiHandlingTicket(ticket)) {
      return false;
    }

    return ticketMatchesSelectedQueues(ticket, selectedQueueIds, {
      supervision: true,
      listMode: "ai"
    });
  }

  if (
    !ticketMatchesSelectedQueues(ticket, selectedQueueIds, {
      supervision,
      listMode
    })
  ) {
    return false;
  }

  if (supervision) {
    return true;
  }

  if (status === "pending") {
    return !isAiHandlingTicket(ticket);
  }

  if (status === "open") {
    if (showAll && profile === "admin") {
      return true;
    }

    return !ticket.userId || Number(ticket.userId) === Number(userId);
  }

  return true;
};

export const isUserTicketOwner = (ticket, user) =>
  !!ticket?.userId && !!user?.id && Number(ticket.userId) === Number(user.id);

export const canUserOperateTicket = (ticket, user) => {
  if (!ticket?.id || !user?.id || ticket.status === "closed") {
    return false;
  }

  if (isUserTicketOwner(ticket, user)) {
    return ticket.status === "open";
  }

  return false;
};

export const isTicketObservationMode = (ticket, user) => {
  if (!ticket?.id || !user?.id) {
    return false;
  }

  if (isUserTicketOwner(ticket, user)) {
    return false;
  }

  if (isHandoffPendingTicket(ticket)) {
    return true;
  }

  if (isAiHandlingTicket(ticket)) {
    return true;
  }

  if (ticket.status === "pending" && !ticket.userId) {
    return true;
  }

  return false;
};
