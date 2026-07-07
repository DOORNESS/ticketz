import Company from "../../models/Company";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import { isAiSchemaReady } from "../MigrationServices/MigrationService";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { logger } from "../../utils/logger";

const DEFAULT_AGENT_NAME = "Atendente Inicial";
const DEFAULT_ACK_MESSAGE =
  "Olá! Sou o assistente virtual da Fortmax. Já estou analisando sua mensagem.";
const DEFAULT_BASE_PROMPT = `Você é o primeiro atendente virtual da Fortmax Sistemas.
Seja cordial, objetivo e resolva o máximo possível antes de envolver um humano.
Use a base de conhecimento quando houver trechos relevantes.
Se não houver informação exata na base, responda com educação, peça detalhes e ofereça ajuda.
Só sugira transferência para atendente humano se o cliente pedir explicitamente.`;

const ensureAgent = async (companyId: number): Promise<AiAgent> => {
  let agent = await AiAgent.findOne({
    where: { companyId, name: DEFAULT_AGENT_NAME }
  });

  const fallbackQueue = await Queue.findOne({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  if (!agent) {
    agent = await AiAgent.findOne({
      where: { companyId, active: true },
      order: [["id", "ASC"]]
    });
  }

  if (!agent) {
    agent = await AiAgent.create({
      companyId,
      name: DEFAULT_AGENT_NAME,
      active: true,
      provider: "openai",
      textModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
      basePrompt: DEFAULT_BASE_PROMPT,
      temperature: 0.4,
      maxTokens: 1024,
      fallbackQueueId: fallbackQueue?.id || null,
      handoffMessage:
        "Vou transferir você para um atendente humano. Por favor, aguarde um momento.",
      ackEnabled: true,
      ackMessage: DEFAULT_ACK_MESSAGE
    });

    return agent;
  }

  await agent.update({
    active: true,
    ackEnabled: true,
    ackMessage: agent.ackMessage?.trim() || DEFAULT_ACK_MESSAGE,
    basePrompt: agent.basePrompt?.trim() || DEFAULT_BASE_PROMPT,
    fallbackQueueId: agent.fallbackQueueId || fallbackQueue?.id || null
  });

  await AiAgent.update(
    {
      ackEnabled: true,
      ackMessage: DEFAULT_ACK_MESSAGE
    },
    {
      where: {
        companyId,
        active: true,
        ackMessage: null
      }
    }
  );

  return agent.reload();
};

const ensureQueueLinks = async (
  companyId: number,
  agent: AiAgent
): Promise<void> => {
  const queues = await Queue.findAll({
    where: { companyId },
    attributes: ["id"]
  });

  if (!queues.length) {
    return;
  }

  const bases = await KnowledgeBase.findAll({
    where: { companyId, active: true },
    attributes: ["id"],
    order: [["id", "ASC"]]
  });

  const defaultKnowledgeBaseId = bases[0]?.id || null;

  await Promise.all(
    queues.map(async queue => {
      const existing = await AiAgentQueue.findOne({
        where: { companyId, queueId: queue.id, aiAgentId: agent.id }
      });

      if (existing) {
        if (!existing.knowledgeBaseId && defaultKnowledgeBaseId) {
          await existing.update({ knowledgeBaseId: defaultKnowledgeBaseId });
        }
        return;
      }

      await AiAgentQueue.create({
        companyId,
        aiAgentId: agent.id,
        queueId: queue.id,
        knowledgeBaseId: defaultKnowledgeBaseId
      });
    })
  );
};

const ensurePendingDocumentsIngested = async (
  companyId: number
): Promise<void> => {
  const pendingDocs = await KnowledgeDocument.findAll({
    where: { companyId, status: "pending" },
    limit: 10,
    order: [["id", "ASC"]]
  });

  await Promise.all(
    pendingDocs.map(async document => {
      try {
        await ingestKnowledgeDocument(document.id, companyId);
      } catch (error) {
        logger.warn(
          { error, documentId: document.id, companyId },
          "Failed to ingest pending knowledge document during AI bootstrap"
        );
      }
    })
  );
};

export const ensureAiFirstResponderForCompany = async (
  companyId: number
): Promise<void> => {
  const agent = await ensureAgent(companyId);
  await ensureQueueLinks(companyId, agent);
  await ensurePendingDocumentsIngested(companyId);
};

export const ensureAiFirstResponderForAllCompanies =
  async (): Promise<void> => {
    if (!(await isAiSchemaReady())) {
      return;
    }

    const companies = await Company.findAll({ attributes: ["id"] });

    await Promise.all(
      companies.map(async company => {
        try {
          await ensureAiFirstResponderForCompany(company.id);
        } catch (error) {
          logger.error(
            { error, companyId: company.id },
            "Failed to ensure AI first responder configuration"
          );
        }
      })
    );
  };
