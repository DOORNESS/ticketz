import { Request, Response } from "express";
import AppError from "../errors/AppError";
import Queue from "../models/Queue";
import User from "../models/User";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import {
  archiveRepositoryItem,
  createRepositoryItem,
  createRepositoryItemFromUpload,
  getRepositoryItem,
  listRepositoryForTicket,
  listRepositoryItems,
  toggleRepositoryFavorite,
  updateRepositoryItem
} from "../services/ContentRepository/ContentRepositoryService";
import sendRepositoryItemToTicket from "../services/ContentRepository/SendContentRepositoryItemService";
import { ContentRepositoryType } from "../models/ContentRepositoryItem";

const currentUserId = (req: Request): number | undefined => {
  const parsed = Number(req.user.id);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBool = (value: unknown, fallback = false): boolean => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const user = await User.findByPk(id, {
    include: [{ model: Queue, as: "queues" }]
  });

  const items = await listRepositoryItems(
    {
      companyId,
      search: req.query.search ? String(req.query.search) : undefined,
      contentType: req.query.contentType
        ? String(req.query.contentType)
        : undefined,
      category: req.query.category ? String(req.query.category) : undefined,
      tag: req.query.tag ? String(req.query.tag) : undefined,
      knowledgeDomainId: req.query.knowledgeDomainId
        ? Number(req.query.knowledgeDomainId)
        : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
      sortBy: (req.query.sortBy as "recent" | "popular" | "name") || "recent"
    },
    {
      userId: Number(id),
      profile,
      companyId,
      queueIds: user?.queues?.map(q => q.id) || []
    }
  );

  return res.json(items);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const item = await getRepositoryItem(companyId, Number(req.params.itemId));
  return res.json(item);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const item = await createRepositoryItem({
    companyId,
    authorUserId: currentUserId(req),
    name: String(req.body.name),
    displayTitle: req.body.displayTitle
      ? String(req.body.displayTitle)
      : undefined,
    contentType: String(
      req.body.contentType || "text"
    ) as ContentRepositoryType,
    category: req.body.category ? String(req.body.category) : undefined,
    description: req.body.description
      ? String(req.body.description)
      : undefined,
    sendCaption: req.body.sendCaption
      ? String(req.body.sendCaption)
      : undefined,
    externalUrl: req.body.externalUrl
      ? String(req.body.externalUrl)
      : undefined,
    tags: req.body.tags,
    knowledgeDomainId: req.body.knowledgeDomainId
      ? Number(req.body.knowledgeDomainId)
      : undefined,
    knowledgeBaseId: req.body.knowledgeBaseId
      ? Number(req.body.knowledgeBaseId)
      : undefined,
    queueIds: Array.isArray(req.body.queueIds)
      ? req.body.queueIds.map(Number)
      : [],
    agentIds: Array.isArray(req.body.agentIds)
      ? req.body.agentIds.map(Number)
      : [],
    aiAgentIds: Array.isArray(req.body.aiAgentIds)
      ? req.body.aiAgentIds.map(Number)
      : [],
    active: parseBool(req.body.active, true),
    allowAiUse: parseBool(req.body.allowAiUse, false),
    allowHumanUse: parseBool(req.body.allowHumanUse, true),
    useForKnowledge: parseBool(req.body.useForKnowledge, false),
    useForDelivery: parseBool(req.body.useForDelivery, true)
  });

  return res.status(201).json(item);
};

export const storeUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const file = req.file;

  if (!file) {
    throw new AppError("ERR_REPOSITORY_FILE_REQUIRED", 400);
  }

  const item = await createRepositoryItemFromUpload({
    companyId,
    authorUserId: currentUserId(req),
    file,
    payload: req.body as Record<string, unknown>
  });

  return res.status(201).json(item);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const item = await updateRepositoryItem({
    companyId,
    itemId: Number(req.params.itemId),
    authorUserId: currentUserId(req),
    changes: {
      name: req.body.name,
      displayTitle: req.body.displayTitle,
      category: req.body.category,
      description: req.body.description,
      sendCaption: req.body.sendCaption,
      externalUrl: req.body.externalUrl,
      tags: req.body.tags,
      active: req.body.active,
      allowAiUse: req.body.allowAiUse,
      allowHumanUse: req.body.allowHumanUse,
      useForKnowledge: req.body.useForKnowledge,
      useForDelivery: req.body.useForDelivery
    },
    file: req.file,
    changeReason: req.body.changeReason
  });

  return res.json(item);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  await archiveRepositoryItem(companyId, Number(req.params.itemId));
  return res.status(204).send();
};

export const favorite = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id } = req.user;
  const result = await toggleRepositoryFavorite({
    companyId,
    userId: Number(id),
    itemId: Number(req.params.itemId)
  });
  return res.json(result);
};

export const ticketIndex = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id } = req.user;
  const ticket = await ShowTicketService(
    Number(req.params.ticketId),
    companyId
  );
  const user = await User.findByPk(id, {
    include: [{ model: Queue, as: "queues" }]
  });

  if (!user) {
    throw new AppError("ERR_NO_USER", 404);
  }

  const items = await listRepositoryForTicket({
    ticket,
    user,
    search: req.query.search ? String(req.query.search) : undefined,
    contentType: req.query.contentType
      ? String(req.query.contentType)
      : undefined,
    category: req.query.category ? String(req.query.category) : undefined
  });

  return res.json(items);
};

export const ticketSend = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;

  const result = await sendRepositoryItemToTicket({
    companyId,
    ticketId: Number(req.params.ticketId),
    itemId: Number(req.params.itemId),
    userId: Number(id),
    profile,
    caption: req.body?.caption ? String(req.body.caption) : undefined
  });

  return res.json(result);
};
