import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import {
  assumeTicketFromBot,
  pauseTicketAi,
  resumeTicketAi
} from "../services/AiServices/AiTicketActionsService";
import {
  generateCopilotSuggestion,
  getLatestCopilotSuggestion,
  markCopilotSuggestionStatus
} from "../services/AiServices/AiCopilotService";
import {
  approveKnowledgeSuggestion,
  generateKnowledgeSuggestion,
  getKnowledgeSuggestionForTicket
} from "../services/AiServices/AiKnowledgeSuggestionService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import formatBody from "../helpers/Mustache";
import User from "../models/User";

const loadTicketForUser = async (req: Request) => {
  const { ticketId } = req.params;
  const { companyId, id: userId } = req.user;
  const ticket = await ShowTicketService(Number(ticketId), companyId);
  const user = await User.findByPk(userId);

  if (!user || user.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  return { ticket, user };
};

export const assume = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);
  const { notifyCustomer } = req.body || {};

  const updated = await assumeTicketFromBot({
    ticket,
    user,
    notifyCustomer: notifyCustomer !== false
  });

  return res.status(200).json(updated);
};

export const pause = async (req: Request, res: Response): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);
  const { transferToQueueId } = req.body || {};

  const updated = await pauseTicketAi({
    ticket,
    user,
    transferToQueueId: transferToQueueId ? Number(transferToQueueId) : undefined
  });

  return res.status(200).json(updated);
};

export const resume = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);

  const updated = await resumeTicketAi({ ticket, user });

  return res.status(200).json(updated);
};

export const copilot = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket } = await loadTicketForUser(req);

  let suggestion = await getLatestCopilotSuggestion(
    ticket.id,
    ticket.companyId
  );

  if (!suggestion) {
    suggestion = await generateCopilotSuggestion({ ticket });
  }

  return res.status(200).json({ suggestion });
};

export const copilotAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);
  const { suggestionId, action } = req.body || {};

  if (!suggestionId || !action) {
    throw new AppError("ERR_INVALID_COPILOT_ACTION", 400);
  }

  const suggestion = await getLatestCopilotSuggestion(
    ticket.id,
    ticket.companyId
  );

  if (!suggestion || suggestion.id !== Number(suggestionId)) {
    throw new AppError("ERR_COPILOT_SUGGESTION_NOT_FOUND", 404);
  }

  if (action === "send") {
    await SendWhatsAppMessage({
      body: formatBody(suggestion.suggestedResponse, ticket),
      ticket,
      userId: user.id
    });
    await markCopilotSuggestionStatus({
      suggestionId: suggestion.id,
      companyId: ticket.companyId,
      status: "sent"
    });
  } else if (action === "ignore") {
    await markCopilotSuggestionStatus({
      suggestionId: suggestion.id,
      companyId: ticket.companyId,
      status: "ignored"
    });
  } else if (action === "copy") {
    await markCopilotSuggestionStatus({
      suggestionId: suggestion.id,
      companyId: ticket.companyId,
      status: "copied"
    });
  } else {
    throw new AppError("ERR_INVALID_COPILOT_ACTION", 400);
  }

  return res.status(200).json({ success: true });
};

export const knowledgeSuggestion = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket } = await loadTicketForUser(req);

  let suggestion = await getKnowledgeSuggestionForTicket(
    ticket.id,
    ticket.companyId
  );

  if (!suggestion) {
    suggestion = await generateKnowledgeSuggestion(ticket);
  }

  return res.status(200).json({ suggestion });
};

export const approveKnowledge = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);
  const { suggestionId, knowledgeBaseId } = req.body || {};

  if (!suggestionId || !knowledgeBaseId) {
    throw new AppError("ERR_INVALID_KNOWLEDGE_APPROVAL", 400);
  }

  if (user.profile !== "admin" && !user.super) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const suggestion = await approveKnowledgeSuggestion({
    suggestionId: Number(suggestionId),
    companyId: ticket.companyId,
    knowledgeBaseId: Number(knowledgeBaseId)
  });

  return res.status(200).json(suggestion);
};
