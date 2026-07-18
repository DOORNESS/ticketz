import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { isOrchestratorEnabledForCompany } from "../services/AiServices/AiOrchestratorFeatureFlag";
import { previewOrchestratorRouting } from "../services/AiServices/AiOrchestratorService";

export const preview = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { message, conversationSummary } = req.body;

  if (!message?.trim()) {
    throw new AppError("message is required", 400);
  }

  const enabled = await isOrchestratorEnabledForCompany(companyId);
  if (!enabled) {
    throw new AppError("AI orchestrator is not enabled for this company", 403);
  }

  const result = await previewOrchestratorRouting(
    companyId,
    message.trim(),
    conversationSummary?.trim()
  );

  return res.json({
    selectedAgent: {
      id: result.agent.id,
      name: result.agent.name,
      specialty: result.agent.specialty,
      role: result.agent.role
    },
    confidence: result.confidence,
    reason: result.reason,
    fallbackUsed: result.fallbackUsed,
    rerouted: result.rerouted,
    routingLogId: result.routingLogId,
    candidates: result.candidates,
    model: result.model
  });
};
