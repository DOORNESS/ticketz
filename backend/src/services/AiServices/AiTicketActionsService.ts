import Ticket from "../../models/Ticket";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import { AI_HANDOFF_REASONS } from "./AiOperationalTypes";
import { logAiOperationalEvent } from "./AiOperationalLogService";

const canManageAi = (user: User): boolean =>
  user.profile === "admin" || user.super === true;

type AssumeFromBotParams = {
  ticket: Ticket;
  user: User;
  notifyCustomer?: boolean;
};

export const assumeTicketFromBot = async ({
  ticket,
  user,
  notifyCustomer = true
}: AssumeFromBotParams): Promise<Ticket> => {
  if (ticket.userId) {
    throw new AppError("ERR_TICKET_ALREADY_ASSIGNED", 409);
  }

  if (ticket.status === "closed") {
    throw new AppError("ERR_TICKET_CLOSED", 400);
  }

  const { ticket: updated } = await UpdateTicketService({
    ticketId: ticket.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: {
      status: "open",
      userId: user.id,
      aiHandoff: true,
      aiHandoffReason: AI_HANDOFF_REASONS.manual_takeover,
      aiPaused: true
    } as any
  });

  if (notifyCustomer) {
    try {
      await SendWhatsAppMessage({
        body: formatBody(
          "Um atendente assumiu seu atendimento e dará continuidade.",
          updated
        ),
        ticket: updated,
        userId: user.id
      });
    } catch {
      // optional customer notification
    }
  }

  await logAiOperationalEvent({
    companyId: user.companyId,
    ticketId: ticket.id,
    event: "human_assumed",
    userId: user.id,
    details: {
      action: "assume_from_bot",
      queueId: updated.queueId
    }
  });

  return updated;
};

type PauseAiParams = {
  ticket: Ticket;
  user: User;
  transferToQueueId?: number | null;
};

export const pauseTicketAi = async ({
  ticket,
  user,
  transferToQueueId
}: PauseAiParams): Promise<Ticket> => {
  if (!canManageAi(user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const updateData: Record<string, unknown> = {
    aiPaused: true,
    aiHandoff: true,
    status: "pending",
    userId: null
  };

  if (transferToQueueId) {
    updateData.queueId = transferToQueueId;
    updateData.aiWaitingSince = new Date();
  }

  const { ticket: updated } = await UpdateTicketService({
    ticketId: ticket.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: updateData as any
  });

  await logAiOperationalEvent({
    companyId: user.companyId,
    ticketId: ticket.id,
    event: "ai_paused",
    userId: user.id,
    details: {
      queueId: updated.queueId
    }
  });

  return updated;
};

type ResumeAiParams = {
  ticket: Ticket;
  user: User;
};

export const resumeTicketAi = async ({
  ticket,
  user
}: ResumeAiParams): Promise<Ticket> => {
  if (!canManageAi(user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (ticket.userId) {
    throw new AppError("ERR_TICKET_ASSIGNED_TO_HUMAN", 409);
  }

  const { ticket: updated } = await UpdateTicketService({
    ticketId: ticket.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: {
      aiPaused: false,
      aiHandoff: false,
      aiHandoffReason: null,
      aiHandoffAt: null,
      aiWaitingSince: null,
      aiSlaBreached: false,
      status: "pending",
      userId: null,
      queueId: null
    } as any
  });

  await logAiOperationalEvent({
    companyId: user.companyId,
    ticketId: ticket.id,
    event: "ai_resumed",
    userId: user.id
  });

  return updated;
};
