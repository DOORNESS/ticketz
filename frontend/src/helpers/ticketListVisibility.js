import {
  isAiHandlingTicket,
  isHandoffPendingTicket,
  isHumanHandlingTicket
} from "./aiTicketStatus";

export const isAiSupervisionTicket = ticket =>
  !!ticket?.aiAgentId && ticket?.status !== "closed";

export const ticketMatchesSelectedWhatsapps = (
  ticket,
  selectedWhatsappIds = []
) => {
  if (!selectedWhatsappIds?.length) {
    return true;
  }

  if (!ticket?.whatsappId) {
    return false;
  }

  return selectedWhatsappIds.includes(ticket.whatsappId);
};

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

export const resolvePermissionRole = user => {
  if (user?.super) {
    return "super";
  }
  return user?.profile || "user";
};

export const shouldShowTicketInList = ({
  ticket,
  status,
  supervision,
  listMode,
  selectedQueueIds,
  selectedWhatsappIds,
  profile,
  showAll,
  userId,
  superUser,
  aiFilter
}) => {
  if (!ticket) {
    return false;
  }

  if (!ticketMatchesSelectedWhatsapps(ticket, selectedWhatsappIds)) {
    return false;
  }

  const bypassQueueScope = superUser || supervision || profile === "admin";

  if (listMode === "ai") {
    if (isHumanHandlingTicket(ticket) && ticket.status === "open") {
      return false;
    }

    const inAiScope =
      aiFilter === "ai_supervision" || bypassQueueScope
        ? isAiSupervisionTicket(ticket) && !ticket.userId
        : isAiHandlingTicket(ticket);

    if (!inAiScope) {
      return false;
    }

    if (bypassQueueScope) {
      return true;
    }

    return ticketMatchesSelectedQueues(ticket, selectedQueueIds, {
      supervision: true,
      listMode: "ai"
    });
  }

  if (!bypassQueueScope) {
    if (
      !ticketMatchesSelectedQueues(ticket, selectedQueueIds, {
        supervision,
        listMode
      })
    ) {
      return false;
    }
  }

  if (bypassQueueScope) {
    if (status === "pending") {
      return ticket.status === "pending";
    }

    if (status === "open") {
      return ticket.status === "open";
    }

    if (status && ticket.status !== status) {
      return false;
    }

    return true;
  }

  if (supervision || superUser) {
    return true;
  }

  if (status === "pending") {
    return !isAiHandlingTicket(ticket);
  }

  if (status === "open") {
    if (ticket.status !== "open") {
      return false;
    }

    if (showAll && (profile === "admin" || superUser)) {
      return true;
    }

    return !ticket.userId || Number(ticket.userId) === Number(userId);
  }

  if (status && ticket.status !== status) {
    return false;
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
