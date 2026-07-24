import { Request, Response } from "express";
import { Mutex } from "async-mutex";
import { getIO } from "../libs/socket";
import Ticket from "../models/Ticket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import { requestPermanentTicketDeletion } from "../services/MediaServices/PermanentDeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketUUIDService from "../services/TicketServices/ShowTicketFromUUIDService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import ShowUserService from "../services/UserServices/ShowUserService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import AppError from "../errors/AppError";
import ListTicketsServiceKanban from "../services/TicketServices/ListTicketsServiceKanban";
import reopenClosedTicketManually from "../services/TicketServices/ReopenClosedTicketManuallyService";
import { serializeTicketWithOperationalState } from "../services/TicketServices/TicketOperationalStateService";
import User from "../models/User";
import canViewTicket from "../helpers/canViewTicket";

type IndexQuery = {
  isSearch?: string;
  searchParam: string;
  pageNumber?: string;
  nextUpdatedAt?: string;
  nextTicketId?: string;
  status: string;
  groups: string;
  date: string;
  updatedAt?: string;
  minUpdatedAt?: string;
  showAll: string;
  withUnreadMessages: string;
  notClosed: string;
  all: string;
  queueIds: string;
  whatsappIds: string;
  contactId: string;
  tags: string;
  users: string;
  aiFilter?: string;
  supervision?: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
}

const updateMutex = new Mutex();

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    nextUpdatedAt,
    nextTicketId,
    status,
    groups,
    date,
    updatedAt,
    minUpdatedAt,
    isSearch,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    whatsappIds: whatsappIdsStringified,
    contactId,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages,
    notClosed,
    all,
    aiFilter,
    supervision
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let whatsappIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (whatsappIdsStringified) {
    whatsappIds = JSON.parse(whatsappIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, count } = await ListTicketsService({
    isSearch: isSearch === "true",
    searchParam,
    contactId: Number(contactId) || undefined,
    tags: tagsIds,
    users: usersIds,
    nextUpdatedAt,
    status,
    groups,
    date,
    updatedAt,
    minUpdatedAt,
    showAll,
    userId,
    queueIds,
    whatsappIds,
    withUnreadMessages,
    notClosed: !!notClosed,
    all: !!all,
    companyId,
    aiFilter,
    supervision: supervision === "true"
  });

  return res.status(200).json({
    tickets: tickets.map(ticket =>
      serializeTicketWithOperationalState(ticket, Number(userId))
    ),
    count
  });
};

export const kanban = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    updatedAt,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsServiceKanban({
    searchParam,
    tags: tagsIds,
    users: usersIds,
    pageNumber,
    status,
    date,
    updatedAt,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    companyId
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, userId, queueId }: TicketData = req.body;
  const { companyId } = req.user;

  const ticket = await CreateTicketService({
    contactId,
    userId,
    companyId,
    queueId
  });

  const io = getIO();
  io.to(`company-${companyId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const ticket = await ShowTicketService(ticketId, companyId);
  const user = await ShowUserService(Number(req.user.id));

  if (!canViewTicket(ticket, user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return res
    .status(200)
    .json(serializeTicketWithOperationalState(ticket, Number(req.user.id)));
};

export const showFromUUID = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { uuid } = req.params;
  const { companyId, id: userId } = req.user;

  const ticket: Ticket = await ShowTicketUUIDService(uuid);

  if (ticket.companyId !== companyId) {
    throw new AppError("Não é possível consultar registros de outra empresa");
  }

  const user = await ShowUserService(userId);

  if (!canViewTicket(ticket, user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return res
    .status(200)
    .json(serializeTicketWithOperationalState(ticket, Number(userId)));
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const { ticket } = await updateMutex.runExclusive(async () => {
    const result = await UpdateTicketService({
      ticketData: req.body,
      ticketId: Number.parseInt(ticketId, 10),
      reqUserId: Number(req.user.id)
    });
    return result;
  });

  return res
    .status(200)
    .json(serializeTicketWithOperationalState(ticket, Number(req.user.id)));
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  await ShowTicketService(ticketId, companyId);

  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new AppError("ERR_NO_USER", 404);
  }

  const audit = await requestPermanentTicketDeletion({
    ticketId: Number(ticketId),
    companyId,
    user
  });

  const io = getIO();
  io.to(ticketId)
    .to(`company-${companyId}-notification`)
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: +ticketId
    });

  return res.status(202).json({
    message: "ticket deletion queued",
    auditId: audit.id,
    status: audit.status
  });
};

export const reopen = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { releaseToAi } = req.body || {};
  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError("ERR_NO_USER", 404);
  }

  const result = await reopenClosedTicketManually({
    ticketId: Number(ticketId),
    user,
    releaseToAi: releaseToAi === true
  });

  return res.status(200).json(result);
};
