import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
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

export const isAiHandlingTicket = (ticket: Ticket): boolean => {
  if (
    !ticket.aiAgentId ||
    ticket.userId ||
    ticket.status === "closed" ||
    ticket.aiPaused
  ) {
    return false;
  }

  if (ticket.aiHandoff && ticket.status === "pending") {
    return false;
  }

  if (ticket.aiHandoff && ticket.aiHandoffMode !== "operational") {
    return false;
  }

  return true;
};

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

  const agent = await getActiveAgentForTicket(ticket);
  return !!agent;
};

export const resolveQueueIdForTicket = async (
  ticket: Pick<Ticket, "queueId" | "whatsappId">
): Promise<number | undefined> => {
  if (ticket.queueId) {
    return ticket.queueId;
  }

  if (!ticket.whatsappId) {
    return undefined;
  }

  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId, {
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });

  if (whatsapp?.queues?.length === 1) {
    return whatsapp.queues[0].id;
  }

  return undefined;
};

export const ensureTicketQueueFromWhatsapp = async (
  ticket: Ticket
): Promise<number | undefined> => {
  const queueId = await resolveQueueIdForTicket(ticket);

  if (queueId && ticket.queueId !== queueId) {
    await ticket.update({ queueId });
    ticket.queueId = queueId;
  }

  return queueId ?? ticket.queueId ?? undefined;
};

export const getActiveAgent = async (
  companyId: number,
  queueId?: number | null
): Promise<AiAgent | null> => {
  if (!queueId) {
    return null;
  }

  const agentQueue = await AiAgentQueue.findOne({
    where: { companyId, queueId },
    include: [
      {
        model: AiAgent,
        where: { active: true, role: { [Op.in]: ["legacy", "specialist"] } },
        required: true
      }
    ],
    order: [["id", "ASC"]]
  });

  return agentQueue?.aiAgent || null;
};

export const getActiveAgentForTicket = async (
  ticket: Ticket
): Promise<AiAgent | null> => {
  const queueId = await ensureTicketQueueFromWhatsapp(ticket);
  return getActiveAgent(ticket.companyId, queueId);
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

  return [];
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
    const legacyIds = await getLegacyKnowledgeBaseIdsForAgent(
      companyId,
      agentId,
      queueId
    );
    if (legacyIds.length) {
      return legacyIds;
    }
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
    const agent = await getActiveAgentForTicket(ticket);
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

const normalizeForMatch = (message: string): string =>
  message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export const AI_ASSISTANT_DISPLAY_NAME = "Webin";
export const AI_ASSISTANT_IDENTITY_REPLY =
  "Me chamo Webin, Assistente Virtual da Fortmax.";

export const detectAgentIdentityQuestion = (message: string): boolean => {
  const text = normalizeForMatch(message);
  if (!text || text.length > 120) {
    return false;
  }

  return /quem (e|esta|está)|vc e|voce e|você é|seu nome|qual (o |)(seu )?nome|quem fala|quem esta|quem está|com quem falo|e voce|é você|e vc|como (voce|você|vc) se chama|precisa ter um nome|sera webin|será webin|me chame de webin|chamar de webin/i.test(
    text
  );
};

export const detectHandoffConfirmationAccept = (message: string): boolean => {
  const text = normalizeForMatch(message);
  return (
    /^(sim|ok|pode|quero|prefiro|atendente|humano|transferir|passa|passe)\b/.test(
      text
    ) || /\b(atendente|humano|transferir|passar para)\b/.test(text)
  );
};

export const detectHandoffConfirmationDecline = (message: string): boolean => {
  const text = normalizeForMatch(message);
  return (
    /^(nao|não|explicar|continuar|tentar|melhor)\b/.test(text) ||
    /\b(explicar melhor|continuar com voce|continuar com você|prefiro explicar)\b/.test(
      text
    )
  );
};

export const buildAgentIdentityReply = (
  _agentName?: string,
  _companyName?: string
): string => AI_ASSISTANT_IDENTITY_REPLY;

export const buildHandoffConfirmationQuestion = (): string =>
  "Não encontrei uma resposta segura na nossa base de conhecimento. Você prefere me explicar melhor sua necessidade ou prefere que eu passe para um atendente humano? Responda *explicar* ou *atendente*.";
