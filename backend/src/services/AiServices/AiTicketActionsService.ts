import Ticket from "../../models/Ticket";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import { AI_HANDOFF_REASONS } from "./AiOperationalTypes";
import { logAiOperationalEvent } from "./AiOperationalLogService";
import {
  assertCanAcceptTicket,
  isHandoffPendingTicketState
} from "../../helpers/assertCanAcceptTicket";
import { isAiHandlingTicket } from "./AiHelpers";
import ShowTicketService from "../TicketServices/ShowTicketService";

const canManageAi = (user: User): boolean =>
  user.profile === "admin" || user.super === true;

export const isAssumeEligibleTicket = (ticket: Ticket): boolean => {
  if (ticket.status === "closed") {
    return false;
  }

  if (isAiHandlingTicket(ticket) || isHandoffPendingTicketState(ticket)) {
    return true;
  }

  return (
    ticket.status === "pending" &&
    !ticket.userId &&
    Boolean(
      ticket.aiHandoff ||
        ticket.aiAgentId ||
        ticket.aiStartedAt ||
        ticket.aiHandoffReason
    )
  );
};

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
  await ticket.reload();

  if (ticket.status === "closed") {
    throw new AppError("ERR_TICKET_CLOSED", 400);
  }

  if (ticket.userId) {
    if (Number(ticket.userId) === Number(user.id)) {
      if (ticket.status === "open") {
        return ShowTicketService(ticket.id, user.companyId);
      }
    } else {
      throw new AppError("ERR_TICKET_ALREADY_ASSIGNED", 409);
    }
  }

  if (!isAssumeEligibleTicket(ticket)) {
    throw new AppError("ERR_TICKET_NOT_AI_HANDLING", 409);
  }

  await assertCanAcceptTicket(ticket, user);

  const { ticket: updated } = await UpdateTicketService({
    ticketId: ticket.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: {
      status: "open",
      userId: user.id,
      aiHandoff: true,
      aiHandoffMode: "definitive",
      aiHandoffOriginalReason:
        ticket.aiHandoffOriginalReason || ticket.aiHandoffReason,
      aiHandoffReason: AI_HANDOFF_REASONS.manual_takeover,
      aiPaused: true,
      aiWaitingSince: null,
      aiSlaEscalationLevel: 0,
      aiSlaBreached: false,
      aiLastSlaAlertAt: null,
      aiHumanAssumedAt: new Date(),
      aiHumanAssumedBy: user.id,
      aiProcessingState: "awaiting_human",
      aiHandoffSummary: [
        "Resumo",
        "- Atendente assumiu o atendimento transferido pela IA.",
        "- Revise o histórico completo antes de responder."
      ].join("\n")
    } as any
  });

  const refreshed = await ShowTicketService(updated.id, user.companyId);

  if (notifyCustomer) {
    void SendWhatsAppMessage({
      body: formatBody(
        "Um atendente assumiu seu atendimento e dará continuidade.",
        refreshed
      ),
      ticket: refreshed,
      userId: user.id
    }).catch(() => undefined);
  }

  void logAiOperationalEvent({
    companyId: user.companyId,
    ticketId: ticket.id,
    event: "human_assumed",
    userId: user.id,
    details: {
      action: "assume_from_bot",
      queueId: refreshed.queueId
    }
  }).catch(() => undefined);

  return refreshed;
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
      aiSlaEscalationLevel: 0,
      aiLastSlaAlertAt: null,
      status: "pending",
      userId: null
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

type ReleaseToAiParams = {
  ticket: Ticket;
  user: User;
};

export const releaseTicketToAi = async ({
  ticket,
  user
}: ReleaseToAiParams): Promise<Ticket> => {
  if (ticket.status === "closed") {
    throw new AppError("ERR_TICKET_CLOSED", 400);
  }

  const isOwner = ticket.userId && Number(ticket.userId) === Number(user.id);
  if (!isOwner && !canManageAi(user)) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const { ticket: updated } = await UpdateTicketService({
    ticketId: ticket.id,
    reqUserId: user.id,
    companyId: user.companyId,
    ticketData: {
      userId: null,
      status: "pending",
      aiHandoff: false,
      aiPaused: false,
      aiHandoffReason: null,
      aiHandoffAt: null,
      aiWaitingSince: null,
      aiSlaBreached: false,
      aiProcessingState: "ai_active",
      aiAssistActive: false,
      aiAssistMode: null,
      aiHumanAssumedAt: null,
      aiHumanAssumedBy: null
    } as any
  });

  await logAiOperationalEvent({
    companyId: user.companyId,
    ticketId: ticket.id,
    event: "ai_resumed",
    userId: user.id,
    details: { action: "release_to_ai" }
  });

  return ShowTicketService(updated.id, user.companyId);
};
