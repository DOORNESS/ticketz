import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import AiConversationLog from "../../models/AiConversationLog";
import Queue from "../../models/Queue";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";

export type SetupStep = {
  key: string;
  label: string;
  completed: boolean;
  href?: string;
  description?: string;
};

export type SetupStatus = {
  showWizard: boolean;
  offerDemo: boolean;
  completedSteps: number;
  totalSteps: number;
  steps: SetupStep[];
  demoAvailable: boolean;
};

const DEMO_BASE_NAME = "Teste";
const DEMO_AGENT_NAME = "Assistente de Teste";
const DEMO_DOCUMENT_TITLE = "Horário de Atendimento";
const DEMO_DOCUMENT_CONTENT =
  "Nosso horário de atendimento é de segunda a sexta das 08:00 às 17:00.";

export const getSetupStatus = async (
  companyId: number
): Promise<SetupStatus> => {
  const [provider, apiKey, agents, bases, readyDocs, logs] = await Promise.all([
    GetCompanySetting(companyId, "aiProvider", null),
    GetCompanySetting(companyId, "openAiKey", null),
    AiAgent.count({ where: { companyId } }),
    KnowledgeBase.count({ where: { companyId } }),
    KnowledgeDocument.count({ where: { companyId, status: "ready" } }),
    AiConversationLog.count({ where: { companyId } })
  ]);

  const steps: SetupStep[] = [
    {
      key: "provider",
      label: "Configurar Provider de IA",
      completed: !!provider,
      href: "/settings",
      description: "Administração → Configurações → Serviços externos"
    },
    {
      key: "api_key",
      label: "Configurar API Key",
      completed: !!apiKey,
      href: "/settings",
      description: "Campo AI Key nas Configurações"
    },
    {
      key: "agent",
      label: "Criar Agente",
      completed: agents > 0,
      href: "/ai/agents"
    },
    {
      key: "knowledge_base",
      label: "Criar Base de Conhecimento",
      completed: bases > 0,
      href: "/ai/knowledge-bases"
    },
    {
      key: "document",
      label: "Adicionar primeiro documento",
      completed: readyDocs > 0,
      href: "/ai/documents"
    },
    {
      key: "test",
      label: "Executar teste",
      completed: logs > 0,
      href: "/ai/playground",
      description: "Use o Playground ou envie mensagem no WhatsApp"
    }
  ];

  const completedSteps = steps.filter(step => step.completed).length;

  return {
    showWizard: agents === 0,
    offerDemo: bases === 0,
    completedSteps,
    totalSteps: steps.length,
    steps,
    demoAvailable: bases === 0
  };
};

export const createDemoEnvironment = async (
  companyId: number
): Promise<{
  knowledgeBaseId: number;
  agentId: number;
  documentId: number;
}> => {
  const existingBase = await KnowledgeBase.findOne({
    where: { companyId, name: DEMO_BASE_NAME }
  });

  const knowledgeBase =
    existingBase ||
    (await KnowledgeBase.create({
      companyId,
      name: DEMO_BASE_NAME,
      description:
        "Ambiente de demonstração inicial — pode ser removido pelo painel.",
      active: true
    }));

  const fallbackQueue = await Queue.findOne({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  let agent = await AiAgent.findOne({
    where: { companyId, name: DEMO_AGENT_NAME }
  });

  if (!agent) {
    agent = await AiAgent.create({
      companyId,
      name: DEMO_AGENT_NAME,
      active: true,
      provider: "openai",
      textModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      transcriptionModel: "whisper-1",
      basePrompt:
        "Você é um assistente de demonstração. Responda com base exclusivamente na base de conhecimento fornecida.",
      temperature: 0.3,
      maxTokens: 1024,
      fallbackQueueId: fallbackQueue?.id || null,
      handoffMessage:
        "Vou transferir você para um atendente humano. Por favor, aguarde."
    });
  } else if (!agent.active) {
    await agent.update({ active: true });
  }

  let document = await KnowledgeDocument.findOne({
    where: {
      companyId,
      knowledgeBaseId: knowledgeBase.id,
      title: DEMO_DOCUMENT_TITLE
    }
  });

  if (!document) {
    document = await KnowledgeDocument.create({
      companyId,
      knowledgeBaseId: knowledgeBase.id,
      title: DEMO_DOCUMENT_TITLE,
      type: "text",
      originalFilename: `${DEMO_DOCUMENT_TITLE}.txt`,
      storageUrl: "setup://demo-hours",
      status: "pending"
    });
  }

  await ingestKnowledgeDocument(document.id, companyId, DEMO_DOCUMENT_CONTENT);
  await document.reload();

  return {
    knowledgeBaseId: knowledgeBase.id,
    agentId: agent.id,
    documentId: document.id
  };
};
