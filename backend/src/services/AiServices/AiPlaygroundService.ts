import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import {
  getActiveAgent,
  resolveSpecialistAgent
} from "./AiHelpers";
import { isOrchestratorEnabledForCompany } from "./AiOrchestratorFeatureFlag";
import { generateSpecialistAiReply } from "./AiSpecialistReplyService";

const TOKEN_COST_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  default: { input: 0.15, output: 0.6 }
};

const estimateCostUsd = (
  model: string,
  tokensInput: number,
  tokensOutput: number
): number => {
  const pricing = TOKEN_COST_PER_MILLION[model] || TOKEN_COST_PER_MILLION.default;
  return (
    (tokensInput / 1_000_000) * pricing.input +
    (tokensOutput / 1_000_000) * pricing.output
  );
};

export type PlaygroundRequest = {
  companyId: number;
  agentId?: number;
  knowledgeBaseId?: number;
  message: string;
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
};

export const runPlaygroundQuery = async ({
  companyId,
  agentId,
  knowledgeBaseId,
  message
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
      agent = await getActiveAgent(companyId);
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
    orchestratorMode
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
    orchestratorMode
  };
};
