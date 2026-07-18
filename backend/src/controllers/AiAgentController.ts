import { Request, Response } from "express";
import { Op } from "sequelize";
import AiAgent from "../models/AiAgent";
import AiAgentQueue from "../models/AiAgentQueue";
import AiAgentKnowledgeBase from "../models/AiAgentKnowledgeBase";
import AppError from "../errors/AppError";
import { safeAiQuery } from "../helpers/safeAiQuery";
import { ensureAiFirstResponderForCompany } from "../services/AiServices/EnsureAiFirstResponderService";
import {
  listAgentKnowledgeBaseIds,
  syncAgentKnowledgeBases
} from "../services/AiServices/AiAgentKnowledgeBaseService";
import KnowledgeBase from "../models/KnowledgeBase";

const VALID_ROLES = new Set(["legacy", "orchestrator", "specialist"]);

const serializeAgent = async (agent: AiAgent) => {
  const knowledgeBaseIds = await listAgentKnowledgeBaseIds(
    agent.companyId,
    agent.id
  );
  const knowledgeBases = knowledgeBaseIds.length
    ? await KnowledgeBase.findAll({
        where: { companyId: agent.companyId, id: knowledgeBaseIds },
        attributes: ["id", "name", "active"]
      })
    : [];

  return {
    ...agent.toJSON(),
    knowledgeBaseIds,
    knowledgeBases
  };
};

const assertSingleOrchestrator = async ({
  companyId,
  role,
  active,
  agentId
}: {
  companyId: number;
  role?: string;
  active?: boolean;
  agentId?: number;
}): Promise<void> => {
  if (role !== "orchestrator" || active === false) {
    return;
  }

  const existing = await AiAgent.findOne({
    where: {
      companyId,
      role: "orchestrator",
      active: true,
      ...(agentId ? { id: { [Op.ne]: agentId } } : {})
    }
  });

  if (existing) {
    throw new AppError(
      "Only one active orchestrator agent is allowed per company",
      400
    );
  }
};

const normalizeAgentPayload = (body: Record<string, unknown>) => {
  const role = String(body.role || "legacy");
  if (!VALID_ROLES.has(role)) {
    throw new AppError("Invalid agent role", 400);
  }

  if (role === "orchestrator" && body.specialty) {
    throw new AppError("Orchestrator agents cannot have specialty", 400);
  }

  return {
    name: String(body.name || ""),
    active: body.active !== false,
    provider: String(body.provider || "openai"),
    textModel: String(body.textModel || "gpt-4o-mini"),
    visionModel: String(body.visionModel || "gpt-4o-mini"),
    transcriptionModel: String(body.transcriptionModel || "whisper-1"),
    basePrompt: (body.basePrompt as string) || null,
    temperature: Number(body.temperature ?? 0.3),
    maxTokens: Number(body.maxTokens ?? 1024),
    fallbackQueueId: body.fallbackQueueId ? Number(body.fallbackQueueId) : null,
    handoffMessage: (body.handoffMessage as string) || null,
    ackEnabled: body.ackEnabled === true,
    ackMessage: (body.ackMessage as string) || null,
    role,
    specialty: role === "specialist" ? String(body.specialty || "geral") : null,
    routingDescription: (body.routingDescription as string) || null,
    routingKeywords: Array.isArray(body.routingKeywords)
      ? (body.routingKeywords as string[])
      : null,
    priority: Number(body.priority ?? 100)
  };
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const agents = await safeAiQuery(
    () =>
      AiAgent.findAll({
        where: { companyId },
        include: ["fallbackQueue", "agentQueues", "agentKnowledgeBases"],
        order: [["name", "ASC"]]
      }),
    []
  );

  const serialized = await Promise.all(
    agents.map(agent => serializeAgent(agent))
  );
  return res.json(serialized);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { queueLinks, knowledgeBaseIds, knowledgeBaseLinks, ...rawBody } =
    req.body;

  const payload = normalizeAgentPayload(rawBody);
  await assertSingleOrchestrator({
    companyId,
    role: payload.role,
    active: payload.active
  });

  const agent = await AiAgent.create({
    companyId,
    ...payload
  });

  if (Array.isArray(queueLinks)) {
    await Promise.all(
      queueLinks.map(link =>
        AiAgentQueue.create({
          companyId,
          aiAgentId: agent.id,
          queueId: link.queueId,
          knowledgeBaseId: link.knowledgeBaseId || null
        })
      )
    );
  }

  if (payload.role === "specialist") {
    await syncAgentKnowledgeBases({
      companyId,
      aiAgentId: agent.id,
      knowledgeBaseIds,
      knowledgeBaseLinks
    });
  }

  await agent.reload({ include: ["fallbackQueue", "agentQueues"] });
  await ensureAiFirstResponderForCompany(companyId);
  return res.status(201).json(await serializeAgent(agent));
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { agentId } = req.params;

  const agent = await AiAgent.findOne({
    where: { id: agentId, companyId }
  });

  if (!agent) {
    throw new AppError("Agent not found", 404);
  }

  const { queueLinks, knowledgeBaseIds, knowledgeBaseLinks, ...rawBody } =
    req.body;
  const payload = normalizeAgentPayload({ ...agent.toJSON(), ...rawBody });

  await assertSingleOrchestrator({
    companyId,
    role: payload.role,
    active: payload.active,
    agentId: agent.id
  });

  await agent.update(payload);

  if (Array.isArray(queueLinks)) {
    await AiAgentQueue.destroy({
      where: { aiAgentId: agent.id, companyId }
    });
    await Promise.all(
      queueLinks.map(link =>
        AiAgentQueue.create({
          companyId,
          aiAgentId: agent.id,
          queueId: link.queueId,
          knowledgeBaseId: link.knowledgeBaseId || null
        })
      )
    );
  }

  if (payload.role === "orchestrator") {
    await AiAgentKnowledgeBase.destroy({
      where: { companyId, aiAgentId: agent.id }
    });
  } else if (
    knowledgeBaseIds !== undefined ||
    knowledgeBaseLinks !== undefined
  ) {
    await syncAgentKnowledgeBases({
      companyId,
      aiAgentId: agent.id,
      knowledgeBaseIds,
      knowledgeBaseLinks
    });
  }

  await agent.reload({ include: ["fallbackQueue", "agentQueues"] });
  await ensureAiFirstResponderForCompany(companyId);
  return res.json(await serializeAgent(agent));
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { agentId } = req.params;

  const agent = await AiAgent.findOne({
    where: { id: agentId, companyId }
  });

  if (!agent) {
    throw new AppError("Agent not found", 404);
  }

  await AiAgentQueue.destroy({ where: { aiAgentId: agent.id, companyId } });
  await AiAgentKnowledgeBase.destroy({
    where: { aiAgentId: agent.id, companyId }
  });
  await agent.destroy();
  return res.status(200).json({ message: "Agent deleted" });
};

export const orchestratorStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { isOrchestratorEnabledForCompany } =
    await import("../services/AiServices/AiOrchestratorFeatureFlag");
  const { getOrchestratorConfig } =
    await import("../services/AiServices/AiOrchestratorConfig");

  const config = getOrchestratorConfig();
  const enabledForCompany = await isOrchestratorEnabledForCompany(companyId);
  const orchestrator = await AiAgent.findOne({
    where: { companyId, role: "orchestrator", active: true }
  });
  const specialists = await AiAgent.count({
    where: { companyId, role: "specialist", active: true }
  });

  return res.json({
    globalEnabled: config.enabled,
    companyEnabled: enabledForCompany,
    active: config.enabled && enabledForCompany,
    orchestratorConfigured: !!orchestrator,
    specialistsCount: specialists,
    config: {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: config.timeoutMs,
      confidenceThreshold: config.confidenceThreshold,
      provider: config.provider
    }
  });
};
