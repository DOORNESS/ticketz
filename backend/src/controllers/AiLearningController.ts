import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import {
  approveLearning,
  findSimilarDocumentsForLearning,
  generateLearningDraft,
  generateUpdateSuggestion,
  getLearningForTicket,
  incorporateLearning,
  listLearnings,
  recordLearningDeclined,
  rejectLearning,
  saveLearningDraft
} from "../services/AiServices/AiLearningService";
import {
  getAiReplayLog,
  listAiReplayLogs
} from "../services/AiServices/AiReplayService";
import User from "../models/User";
import Ticket from "../models/Ticket";

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

export const learningDraft = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);
  const { actionType } = req.body || {};

  if (!["create_new", "update_existing", "review_later"].includes(actionType)) {
    throw new AppError("ERR_INVALID_LEARNING_ACTION", 400);
  }

  const suggestion = await generateLearningDraft({
    ticket,
    actionType,
    agentUserId: user.id
  });

  return res.status(200).json({ suggestion });
};

export const learningSimilarDocs = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket } = await loadTicketForUser(req);
  const { query } = req.body || {};

  const documents = await findSimilarDocumentsForLearning({ ticket, query });

  return res.status(200).json({ documents });
};

export const learningUpdateDraft = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);
  const { documentId } = req.body || {};

  if (!documentId) {
    throw new AppError("ERR_INVALID_DOCUMENT_ID", 400);
  }

  const suggestion = await generateUpdateSuggestion({
    ticket,
    documentId: Number(documentId),
    agentUserId: user.id
  });

  return res.status(200).json({ suggestion });
};

export const learningSave = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket } = await loadTicketForUser(req);
  const { suggestionId, ...data } = req.body || {};

  if (!suggestionId) {
    throw new AppError("ERR_INVALID_LEARNING_SAVE", 400);
  }

  const suggestion = await saveLearningDraft({
    suggestionId: Number(suggestionId),
    companyId: ticket.companyId,
    data
  });

  return res.status(200).json({ suggestion });
};

export const learningDecline = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket, user } = await loadTicketForUser(req);

  await recordLearningDeclined({ ticket, agentUserId: user.id });

  return res.status(200).json({ success: true });
};

export const learningForTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket } = await loadTicketForUser(req);
  const suggestion = await getLearningForTicket(ticket.id, ticket.companyId);

  return res.status(200).json({ suggestion });
};

export const indexLearnings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { status, page = "1", limit = "50" } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

  const result = await listLearnings({
    companyId,
    status: status ? String(status) : undefined,
    limit: limitNum,
    offset: (pageNum - 1) * limitNum
  });

  return res.status(200).json({
    learnings: result.rows,
    count: result.count,
    page: pageNum,
    limit: limitNum
  });
};

export const approveLearningAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { learningId } = req.params;

  const learning = await approveLearning({
    learningId: Number(learningId),
    companyId,
    userId: Number(userId)
  });

  return res.status(200).json(learning);
};

export const rejectLearningAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { learningId } = req.params;
  const { reason } = req.body || {};

  const learning = await rejectLearning({
    learningId: Number(learningId),
    companyId,
    userId: Number(userId),
    reason
  });

  return res.status(200).json(learning);
};

export const incorporateLearningAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { learningId } = req.params;
  const { knowledgeBaseId } = req.body || {};

  if (!knowledgeBaseId) {
    throw new AppError("ERR_INVALID_KNOWLEDGE_BASE", 400);
  }

  const learning = await incorporateLearning({
    learningId: Number(learningId),
    companyId,
    userId: Number(userId),
    knowledgeBaseId: Number(knowledgeBaseId)
  });

  return res.status(200).json(learning);
};

export const editLearningAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { learningId } = req.params;
  const data = req.body || {};

  const learning = await saveLearningDraft({
    suggestionId: Number(learningId),
    companyId,
    data
  });

  return res.status(200).json(learning);
};

export const replayIndex = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { ticketId, page = "1", limit = "50" } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

  const result = await listAiReplayLogs({
    companyId,
    ticketId: ticketId ? Number(ticketId) : undefined,
    limit: limitNum,
    offset: (pageNum - 1) * limitNum
  });

  return res.status(200).json({
    replays: result.rows,
    count: result.count,
    page: pageNum,
    limit: limitNum
  });
};

export const replayShow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { replayId } = req.params;

  const replay = await getAiReplayLog(Number(replayId), companyId);

  if (!replay) {
    throw new AppError("ERR_REPLAY_NOT_FOUND", 404);
  }

  return res.status(200).json(replay);
};

export const explainability = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticket } = await loadTicketForUser(req);

  const fullTicket = await Ticket.findByPk(ticket.id, {
    attributes: ["aiLastExplainability", "aiLastConfidence"]
  });

  return res.status(200).json({
    confidence: fullTicket?.aiLastConfidence,
    explainability: fullTicket?.aiLastExplainability
  });
};
