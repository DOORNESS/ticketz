import { Op } from "sequelize";
import { Request, Response } from "express";
import AiConversationLog from "../models/AiConversationLog";
import { safeAiQuery } from "../helpers/safeAiQuery";
import {
  buildBrandTicketFilter,
  parseRequestedBrandIds
} from "../services/BrandServices/BrandTicketScopeService";

const maskText = (value?: string): string => {
  if (!value) return "";
  return value
    .replace(/sk-[a-zA-Z0-9]+/g, "[MASKED_KEY]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[MASKED_CPF]");
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { ticketId, page = "1", limit = "50" } = req.query;

  const where: {
    companyId: number;
    ticketId?: number | object;
  } = { companyId };
  if (ticketId) {
    where.ticketId = Number(ticketId);
  }

  // O log pertence ao atendimento, e o atendimento é quem carrega a marca.
  // Sem este recorte a tela mostrava conversa da Nível com Fortmax escolhida.
  const brandTicketFilter = await buildBrandTicketFilter(
    companyId,
    req.user.id,
    parseRequestedBrandIds(req.query.brandIds)
  );
  if (brandTicketFilter && !ticketId) {
    where.ticketId = brandTicketFilter;
  }

  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.min(Math.max(Number(limit), 1), 100);
  const offset = (pageNum - 1) * limitNum;

  const { rows, count } = await safeAiQuery(
    () =>
      AiConversationLog.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit: limitNum,
        offset
      }),
    { rows: [], count: 0 }
  );

  const logs = rows.map(log => ({
    ...log.toJSON(),
    userMessage: maskText(log.userMessage),
    aiResponse: maskText(log.aiResponse),
    error: maskText(log.error)
  }));

  return res.json({ logs, count, page: pageNum, limit: limitNum });
};
