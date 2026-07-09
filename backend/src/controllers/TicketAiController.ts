import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import {
  assumeTicketFromBot,
  pauseTicketAi,
  resumeTicketAi
} from "../services/AiServices/AiTicketActionsService";
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
    transferToQueueId: transferToQueueId
      ? Number(transferToQueueId)
      : undefined
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
