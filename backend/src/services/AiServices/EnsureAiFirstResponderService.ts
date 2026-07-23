import Company from "../../models/Company";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import KnowledgeBase from "../../models/KnowledgeBase";
import { Op } from "sequelize";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import { isAiSchemaReady } from "../MigrationServices/MigrationService";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { logger } from "../../utils/logger";

const DEFAULT_AGENT_NAME = "Atendente Inicial";
const DEFAULT_ACK_MESSAGE = "Olá! Já estou analisando sua mensagem.";
const DEFAULT_BASE_PROMPT = `Você é o primeiro atendente virtual da Fortmax Sistemas.
Mantenha conversa contínua e responda toda mensagem do cliente.
Use a base de conhecimento sobre produtos, histórico da empresa e contatos.
Responda com objetividade quando a informação estiver na base (ex.: anos no mercado, sistemas WebG3/FortControl).
Só transfira para humano quando o cliente pedir atendente/pessoa ou em assuntos sensíveis.`;

const findPreferredHandoffQueue = async (
  companyId: number
): Promise<Queue | null> => {
  const queues = await Queue.findAll({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  const preferred = queues.find(queue => {
    const name = queue.name.toLowerCase();
    return (
      name.includes("suporte") ||
      name.includes("atendimento") ||
      name.includes("gerência") ||
      name.includes("gerencia")
    );
  });

  return preferred || queues[0] || null;
};

const ensureAgent = async (companyId: number): Promise<AiAgent> => {
  let agent = await AiAgent.findOne({
    where: { companyId, name: DEFAULT_AGENT_NAME }
  });

  const handoffQueue = await findPreferredHandoffQueue(companyId);

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
      transcriptionModel: "whisper-1",
      basePrompt: DEFAULT_BASE_PROMPT,
      temperature: 0.4,
      maxTokens: 1024,
      fallbackQueueId: handoffQueue?.id || null,
      handoffMessage:
        "Vou transferir você para o Suporte humano. Por favor, aguarde um momento.",
      ackEnabled: false,
      ackMessage: DEFAULT_ACK_MESSAGE
    });

    return agent;
  }

  // Bootstrap only fills empty fields — never clobber admin UI saves.
  await agent.update({
    active: true,
    ackMessage: agent.ackMessage?.trim() || DEFAULT_ACK_MESSAGE,
    basePrompt: agent.basePrompt?.trim() || DEFAULT_BASE_PROMPT,
    handoffMessage:
      agent.handoffMessage?.trim() ||
      "Vou transferir você para o Suporte humano. Por favor, aguarde um momento.",
    fallbackQueueId: agent.fallbackQueueId || handoffQueue?.id || null
  });

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
    where: {
      companyId,
      status: { [Op.in]: ["pending", "error"] }
    },
    limit: 10,
    order: [["updatedAt", "ASC"]]
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
