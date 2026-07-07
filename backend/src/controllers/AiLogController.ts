import { Request, Response } from "express";
import AiConversationLog from "../models/AiConversationLog";

const maskText = (value?: string): string => {
  if (!value) return "";
  return value
    .replace(/sk-[a-zA-Z0-9]+/g, "[MASKED_KEY]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[MASKED_CPF]");
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { ticketId, page = "1", limit = "50" } = req.query;

  const where: { companyId: number; ticketId?: number } = { companyId };
  if (ticketId) {
    where.ticketId = Number(ticketId);
  }

  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.min(Math.max(Number(limit), 1), 100);
  const offset = (pageNum - 1) * limitNum;

  const { rows, count } = await AiConversationLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: limitNum,
    offset
  });

  const logs = rows.map(log => ({
    ...log.toJSON(),
    userMessage: maskText(log.userMessage),
    aiResponse: maskText(log.aiResponse),
    error: maskText(log.error)
  }));

  return res.json({ logs, count, page: pageNum, limit: limitNum });
};
