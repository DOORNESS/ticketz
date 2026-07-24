import { Op } from "sequelize";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import { resolveSpecialistAgent } from "./AiHelpers";
import { isOrchestratorEnabledForCompany } from "./AiOrchestratorFeatureFlag";
import { generateSpecialistAiReply } from "./AiSpecialistReplyService";
import { estimateCostUsd } from "./pricing/AiPricingCatalog";

export type PlaygroundRequest = {
  companyId: number;
  agentId?: number;
  knowledgeBaseId?: number;
  contactId?: number;
  ticketId?: number;
  message: string;
  simulateMemory?: boolean;
  simulateTools?: boolean;
  simulateWriteTools?: boolean;
};

export type PlaygroundChunk = {
  id: number;
  content: string;
  similarity: number;
  documentTitle?: string;
};

export type PlaygroundResult = {
  response: string;
  agent: { id: number; name: string; model: string; specialty?: string | null };
  routing?: {
    confidence: number;
    reason: string;
    fallbackUsed: boolean;
    routingLogId: number;
  };
  knowledgeBaseIds: number[];
  chunks: PlaygroundChunk[];
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  latencyMs: number;
  model: string;
  orchestratorMode: boolean;
  toolCallsExecuted?: number;
  handoffTriggered?: boolean;
};

export const runPlaygroundQuery = async ({
  companyId,
  agentId,
  knowledgeBaseId,
  contactId,
  ticketId,
  message,
  simulateMemory,
  simulateTools,
  simulateWriteTools
}: PlaygroundRequest): Promise<PlaygroundResult> => {
  const startedAt = Date.now();
  const orchestratorMode = await isOrchestratorEnabledForCompany(companyId);

  if (knowledgeBaseId && orchestratorMode) {
    throw new AppError(
      "Manual knowledgeBaseId override is disabled while orchestrator mode is active",
      400
    );
  }

  let agent: AiAgent;
  let routingMeta:
    | {
        confidence: number;
        reason: string;
        fallbackUsed: boolean;
        routingLogId: number;
      }
    | undefined;

  if (orchestratorMode) {
    const playgroundTicket = {
      id: null,
      companyId,
      queueId: null,
      aiAgentId: null,
      update: async () => undefined
    } as unknown as Ticket;

    const resolved = await resolveSpecialistAgent({
      companyId,
      ticket: playgroundTicket,
      userText: message,
      messageId: `playground-${Date.now()}`,
      persistTicketAssignment: false
    });

    agent = resolved.agent;
    routingMeta = resolved.routing
      ? {
          confidence: resolved.routing.confidence,
          reason: resolved.routing.reason,
          fallbackUsed: resolved.routing.fallbackUsed,
          routingLogId: resolved.routing.routingLogId
        }
      : undefined;
  } else {
    if (agentId) {
      agent = await AiAgent.findOne({
        where: { id: agentId, companyId, active: true }
      });
      if (!agent) {
        throw new AppError("Active AI agent not found", 404);
      }
    } else {
      agent = await AiAgent.findOne({
        where: {
          companyId,
          active: true,
          role: { [Op.in]: ["legacy", "specialist"] }
        },
        order: [["id", "ASC"]]
      });
      if (!agent) {
        throw new AppError("Active AI agent not found", 404);
      }
    }

    if (knowledgeBaseId) {
      const base = await KnowledgeBase.findOne({
        where: { id: knowledgeBaseId, companyId, active: true }
      });
      if (!base) {
        throw new AppError("Knowledge base not found", 404);
      }
    }
  }

  const reply = await generateSpecialistAiReply({
    companyId,
    agent,
    userText: message,
    orchestratorMode,
    contactId: contactId || (simulateMemory ? 0 : undefined),
    ticketId: ticketId || (simulateTools || simulateWriteTools ? 0 : undefined)
  });

  return {
    response: reply.response,
    agent: {
      id: reply.agent.id,
      name: reply.agent.name,
      model: reply.agent.textModel,
      specialty: reply.agent.specialty
    },
    routing: routingMeta,
    knowledgeBaseIds: reply.knowledgeBaseIds,
    chunks: reply.chunks,
    tokensInput: reply.tokensInput,
    tokensOutput: reply.tokensOutput,
    estimatedCostUsd: estimateCostUsd(
      reply.model,
      reply.tokensInput,
      reply.tokensOutput
    ),
    latencyMs: Date.now() - startedAt,
    model: reply.model,
    orchestratorMode,
    toolCallsExecuted: reply.toolCallsExecuted,
    handoffTriggered: reply.handoffTriggered
  };
};
