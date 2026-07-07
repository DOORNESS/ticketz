import { Request, Response } from "express";
import AiAgent from "../models/AiAgent";
import AiAgentQueue from "../models/AiAgentQueue";
import AppError from "../errors/AppError";
import { safeAiQuery } from "../helpers/safeAiQuery";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const agents = await safeAiQuery(
    () =>
      AiAgent.findAll({
        where: { companyId },
        include: ["fallbackQueue", "agentQueues"],
        order: [["name", "ASC"]]
      }),
    []
  );
  return res.json(agents);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    active,
    provider,
    textModel,
    visionModel,
    transcriptionModel,
    basePrompt,
    temperature,
    maxTokens,
    fallbackQueueId,
    handoffMessage,
    ackEnabled,
    ackMessage,
    queueLinks
  } = req.body;

  const agent = await AiAgent.create({
    companyId,
    name,
    active: active !== false,
    provider: provider || "openai",
    textModel: textModel || "gpt-4o-mini",
    visionModel: visionModel || "gpt-4o-mini",
    transcriptionModel: transcriptionModel || "gpt-4o-mini-transcribe",
    basePrompt,
    temperature: temperature ?? 0.3,
    maxTokens: maxTokens ?? 1024,
    fallbackQueueId: fallbackQueueId || null,
    handoffMessage,
    ackEnabled: ackEnabled === true,
    ackMessage: ackMessage || null
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

  await agent.reload({ include: ["fallbackQueue", "agentQueues"] });
  return res.status(201).json(agent);
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

  const { queueLinks, ...data } = req.body;
  await agent.update(data);

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

  await agent.reload({ include: ["fallbackQueue", "agentQueues"] });
  return res.json(agent);
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
  await agent.destroy();
  return res.status(200).json({ message: "Agent deleted" });
};
