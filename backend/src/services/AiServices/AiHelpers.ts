import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import KnowledgeBase from "../../models/KnowledgeBase";
import { Op } from "sequelize";
import { isOrchestratorEnabledForCompany } from "./AiOrchestratorFeatureFlag";
import {
  detectTopicShift,
  runOrchestrator,
  scoreSpecialtyKeywords,
  type OrchestratorResult
} from "./AiOrchestratorService";
import { listAgentKnowledgeBaseIds } from "./AiAgentKnowledgeBaseService";

const HANDOFF_KEYWORDS = [
  "quero atendente",
  "quero um atendente",
  "chamar atendente",
  "falar com atendente",
  "atendente humano",
  "humano",
  "pessoa real",
  "falar com alguem",
  "falar com alguém",
  "transferir para atendente",
  "transferir para humano",
  "suporte humano",
  "me transfere",
  "me transferir"
];

const SENSITIVE_KEYWORDS = [
  "cancelamento",
  "cancelar",
  "contrato",
  "cobrança",
  "cobranca",
  "reembolso",
  "cpf",
  "cnpj",
  "senha",
  "dados pessoais"
];

export const canAiEngageTicket = (ticket: Ticket): boolean => {
  if (ticket.userId) return false;
  if (ticket.aiPaused) return false;
  if (ticket.isGroup) return false;
  if (ticket.status === "closed") return false;
  if (ticket.contact?.disableBot) return false;

  if (ticket.aiHandoff) {
    return ticket.aiHandoffMode === "operational";
  }

  return true;
};

export const isAiHandlingTicket = (ticket: Ticket): boolean =>
  !!ticket.aiAgentId &&
  (!ticket.aiHandoff || ticket.aiHandoffMode === "operational") &&
  !ticket.aiPaused &&
  !ticket.userId &&
  ticket.status !== "closed";

export const shouldSuppressHumanNotification = (ticket: Ticket): boolean =>
  isAiHandlingTicket(ticket);

export const shouldAiHandleTicket = async (
  ticket: Ticket
): Promise<boolean> => {
  if (ticket.aiHandoff) return false;
  if (ticket.userId) return false;
  if (ticket.isGroup) return false;
  if (ticket.status === "closed") return false;
  if (ticket.contact?.disableBot) return false;

  const orchestratorEnabled = await isOrchestratorEnabledForCompany(
    ticket.companyId
  );

  if (orchestratorEnabled) {
    const specialists = await AiAgent.count({
      where: {
        companyId: ticket.companyId,
        active: true,
        role: "specialist"
      }
    });
    return specialists > 0;
  }

  const agent = await getActiveAgent(ticket.companyId, ticket.queueId);
  return !!agent;
};

export const getActiveAgent = async (
  companyId: number,
  queueId?: number
): Promise<AiAgent | null> => {
  if (queueId) {
    const agentQueue = await AiAgentQueue.findOne({
      where: { companyId, queueId },
      include: [
        {
          model: AiAgent,
          where: { active: true, role: { [Op.in]: ["legacy", "specialist"] } },
          required: true
        }
      ]
    });
    if (agentQueue?.aiAgent) {
      return agentQueue.aiAgent;
    }
  }

  return AiAgent.findOne({
    where: {
      companyId,
      active: true,
      role: { [Op.in]: ["legacy", "specialist"] }
    },
    order: [["id", "ASC"]]
  });
};

const getLegacyKnowledgeBaseIdsForAgent = async (
  companyId: number,
  agentId: number,
  queueId?: number
): Promise<number[]> => {
  const where: { companyId: number; aiAgentId: number; queueId?: number } = {
    companyId,
    aiAgentId: agentId
  };

  if (queueId) {
    where.queueId = queueId;
  }

  const links = await AiAgentQueue.findAll({ where });

  const ids = links
    .map(link => link.knowledgeBaseId)
    .filter((id): id is number => !!id);

  if (ids.length) {
    return [...new Set(ids)];
  }

  const bases = await KnowledgeBase.findAll({
    where: { companyId, active: true },
    attributes: ["id"]
  });

  return bases.map(b => b.id);
};

export const getKnowledgeBaseIdsForAgent = async (
  companyId: number,
  agentId: number,
  queueId?: number,
  options?: { orchestratorMode?: boolean }
): Promise<number[]> => {
  const orchestratorMode =
    options?.orchestratorMode ??
    (await isOrchestratorEnabledForCompany(companyId));

  const directLinks = await listAgentKnowledgeBaseIds(companyId, agentId);
  if (directLinks.length) {
    return directLinks;
  }

  const where: { companyId: number; aiAgentId: number; queueId?: number } = {
    companyId,
    aiAgentId: agentId
  };

  if (queueId) {
    where.queueId = queueId;
  }

  const queueLinks = await AiAgentQueue.findAll({ where });
  const queueIds = queueLinks
    .map(link => link.knowledgeBaseId)
    .filter((id): id is number => !!id);

  if (queueIds.length) {
    return [...new Set(queueIds)];
  }

  if (orchestratorMode) {
    return [];
  }

  return getLegacyKnowledgeBaseIdsForAgent(companyId, agentId, queueId);
};

export const shouldRerouteSpecialist = async (
  ticket: Ticket,
  userText: string,
  currentAgent: AiAgent
): Promise<boolean> => {
  if (detectTopicShift(userText)) {
    return true;
  }

  const specialists = await AiAgent.findAll({
    where: { companyId: ticket.companyId, active: true, role: "specialist" }
  });

  if (specialists.length <= 1) {
    return false;
  }

  const scored = scoreSpecialtyKeywords(userText, specialists);
  const currentScore =
    scored.find(item => item.agentId === currentAgent.id)?.keywordScore || 0;
  const top = scored[0];

  if (!top || top.agentId === currentAgent.id) {
    return false;
  }

  return (top.keywordScore || 0) >= currentScore + 3;
};

export type ResolveSpecialistResult = {
  agent: AiAgent;
  routing?: OrchestratorResult;
  orchestratorMode: boolean;
};

export const resolveSpecialistAgent = async ({
  companyId,
  ticket,
  userText,
  conversationSummary,
  messageId,
  persistTicketAssignment = true
}: {
  companyId: number;
  ticket: Ticket;
  userText: string;
  conversationSummary?: string;
  messageId?: string;
  persistTicketAssignment?: boolean;
}): Promise<ResolveSpecialistResult> => {
  const orchestratorMode = await isOrchestratorEnabledForCompany(companyId);

  if (!orchestratorMode) {
    const agent = await getActiveAgent(companyId, ticket.queueId);
    if (!agent) {
      throw new Error("No active agent configured");
    }
    return { agent, orchestratorMode: false };
  }

  if (ticket.aiAgentId) {
    const existing = await AiAgent.findOne({
      where: {
        id: ticket.aiAgentId,
        companyId,
        active: true,
        role: "specialist"
      }
    });

    if (existing) {
      const reroute = await shouldRerouteSpecialist(ticket, userText, existing);
      if (!reroute) {
        return { agent: existing, orchestratorMode: true };
      }
    }
  }

  const routing = await runOrchestrator({
    companyId,
    ticketId: ticket.id,
    messageId,
    userText,
    conversationSummary,
    rerouted: !!ticket.aiAgentId
  });

  if (persistTicketAssignment) {
    await ticket.update({ aiAgentId: routing.agent.id });
  }

  return {
    agent: routing.agent,
    routing,
    orchestratorMode: true
  };
};

export const getSpecialtyPromptRules = (specialty?: string | null): string => {
  const rules: Record<string, string> = {
    financeiro:
      "Você é especialista financeiro. Responda apenas sobre pagamentos, PIX, boletos, cobranças, extratos e temas financeiros.",
    suporte:
      "Você é suporte técnico. Foque em erros, acesso, configuração, integrações e diagnóstico técnico.",
    faq: "Responda de forma objetiva com base na FAQ oficial da empresa.",
    geral:
      "Você faz atendimento inicial. Seja cordial, peça detalhes quando necessário e não invente informações."
  };

  return rules[String(specialty || "geral").toLowerCase()] || rules.geral;
};

export const detectHumanHandoffRequest = (message: string): boolean => {
  const lower = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return HANDOFF_KEYWORDS.some(keyword => {
    const normalizedKeyword = keyword
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return lower.includes(normalizedKeyword);
  });
};

export const detectSensitiveTopic = (message: string): boolean => {
  const lower = message.toLowerCase();
  return SENSITIVE_KEYWORDS.some(keyword => lower.includes(keyword));
};

export const detectLowConfidenceResponse = (response: string): boolean => {
  const lower = response.toLowerCase();
  const markers = [
    "não tenho essa informação",
    "nao tenho essa informacao",
    "não encontrei",
    "nao encontrei",
    "não sei responder",
    "nao sei responder",
    "transferir para um atendente",
    "vou transferir",
    "não possuo essa informação"
  ];
  return markers.some(marker => lower.includes(marker));
};

const RESOLUTION_KEYWORDS = [
  "obrigado",
  "obrigada",
  "valeu",
  "resolvido",
  "resolvi",
  "perfeito",
  "era isso",
  "pode encerrar",
  "pode finalizar",
  "tudo certo",
  "ajudou",
  "ajudou muito"
];

export const detectCustomerResolution = (message: string): boolean => {
  const lower = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return RESOLUTION_KEYWORDS.some(keyword => lower.includes(keyword));
};
