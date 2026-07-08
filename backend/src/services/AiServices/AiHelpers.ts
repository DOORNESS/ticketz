import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import KnowledgeBase from "../../models/KnowledgeBase";

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
  if (ticket.isGroup) return false;
  if (ticket.status === "closed") return false;
  if (ticket.contact?.disableBot) return false;
  return true;
};

export const shouldAiHandleTicket = async (
  ticket: Ticket
): Promise<boolean> => {
  if (ticket.aiHandoff) return false;
  if (ticket.userId) return false;
  if (ticket.isGroup) return false;
  if (ticket.status === "closed") return false;
  if (ticket.contact?.disableBot) return false;

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
      include: [{ model: AiAgent, where: { active: true }, required: true }]
    });
    if (agentQueue?.aiAgent) {
      return agentQueue.aiAgent;
    }
  }

  return AiAgent.findOne({
    where: { companyId, active: true },
    order: [["id", "ASC"]]
  });
};

export const getKnowledgeBaseIdsForAgent = async (
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
