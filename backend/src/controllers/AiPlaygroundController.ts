import { Request, Response } from "express";
import { runPlaygroundQuery } from "../services/AiServices/AiPlaygroundService";
import AiConversationLog from "../models/AiConversationLog";
import AppError from "../errors/AppError";

export const query = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { agentId, knowledgeBaseId, message } = req.body;

  if (!agentId || !message?.trim()) {
    throw new AppError("message is required", 400);
  }

  const result = await runPlaygroundQuery({
    companyId,
    agentId: agentId ? Number(agentId) : undefined,
    knowledgeBaseId: knowledgeBaseId ? Number(knowledgeBaseId) : undefined,
    message: message.trim()
  });

  await AiConversationLog.create({
    companyId,
    ticketId: null,
    messageId: `playground-${Date.now()}`,
    direction: "playground",
    userMessage: message.trim(),
    aiResponse: result.response,
    usedChunks: result.chunks,
    model: result.model,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    transferredToHuman: false
  });

  return res.json(result);
};
