import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import { chatCompletion } from "./ModelGateway";
import { logger } from "../../utils/logger";

type QueueMatch = {
  queueId: number;
  queueName: string;
  method: "keyword" | "llm" | "fallback";
  confidence: number;
  reason: string;
};

const QUEUE_TOPIC_RULES: Record<string, string[]> = {
  financeiro: [
    "financeiro",
    "cobrança",
    "cobranca",
    "pagamento",
    "boleto",
    "fatura",
    "nota fiscal",
    "reembolso",
    "cancelamento",
    "contrato"
  ],
  suporte: [
    "suporte",
    "técnico",
    "tecnico",
    "erro",
    "bug",
    "sistema",
    "acesso",
    "login",
    "senha",
    "instalação",
    "instalacao"
  ],
  gerência: [
    "gerente",
    "gerência",
    "gerencia",
    "diretoria",
    "gestão",
    "gestao",
    "reclamação",
    "reclamacao",
    "ouvidoria"
  ],
  comercial: [
    "comercial",
    "vendas",
    "orçamento",
    "orcamento",
    "proposta",
    "preço",
    "preco",
    "plano"
  ]
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const scoreQueueByKeywords = (
  queue: Queue,
  conversationText: string
): number => {
  const haystack = normalize(`${queue.name} ${queue.greetingMessage || ""}`);
  const needle = normalize(conversationText);
  let score = 0;

  Object.entries(QUEUE_TOPIC_RULES).forEach(([topic, keywords]) => {
    const topicInQueue = keywords.some(keyword => haystack.includes(keyword));
    const topicInConversation = keywords.some(keyword =>
      needle.includes(keyword)
    );

    if (topicInQueue && topicInConversation) {
      score += 3;
    } else if (topicInConversation && haystack.includes(topic)) {
      score += 2;
    }
  });

  keywordsFromQueueName(queue.name).forEach(keyword => {
    if (needle.includes(keyword)) {
      score += 2;
    }
  });

  return score;
};

const keywordsFromQueueName = (queueName: string): string[] =>
  normalize(queueName)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4);

const resolveByKeywords = async (
  companyId: number,
  conversationText: string
): Promise<QueueMatch | null> => {
  const queues = await Queue.findAll({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  if (!queues.length) {
    return null;
  }

  const ranked = queues
    .map(queue => ({
      queue,
      score: scoreQueueByKeywords(queue, conversationText)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return null;
  }

  const best = ranked[0];
  return {
    queueId: best.queue.id,
    queueName: best.queue.name,
    method: "keyword",
    confidence: Math.min(best.score / 6, 1),
    reason: `keyword_match_score_${best.score}`
  };
};

const resolveByLlm = async (
  companyId: number,
  conversationText: string,
  agent: AiAgent
): Promise<QueueMatch | null> => {
  const queues = await Queue.findAll({
    where: { companyId },
    attributes: ["id", "name", "greetingMessage"],
    order: [["id", "ASC"]]
  });

  if (queues.length < 2) {
    return null;
  }

  const queueCatalog = queues
    .map(
      queue =>
        `${queue.id}: ${queue.name}${queue.greetingMessage ? ` — ${queue.greetingMessage.slice(0, 120)}` : ""}`
    )
    .join("\n");

  try {
    const completion = await chatCompletion(companyId, {
      model: agent.textModel,
      temperature: 0,
      maxTokens: 120,
      providerId: agent.provider,
      messages: [
        {
          role: "system",
          content:
            'Classifique o assunto da conversa e escolha o departamento mais adequado. Responda APENAS JSON: {"queueId": number|null, "confidence": number, "reason": string}.'
        },
        {
          role: "user",
          content: `Departamentos:\n${queueCatalog}\n\nConversa:\n${conversationText}`
        }
      ]
    });

    const raw = completion.content?.trim() || "";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      return null;
    }

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      queueId?: number | null;
      confidence?: number;
      reason?: string;
    };

    if (!parsed.queueId) {
      return null;
    }

    const queue = queues.find(item => item.id === Number(parsed.queueId));
    if (!queue) {
      return null;
    }

    return {
      queueId: queue.id,
      queueName: queue.name,
      method: "llm",
      confidence: Number(parsed.confidence) || 0.5,
      reason: parsed.reason || "llm_classification"
    };
  } catch (error) {
    logger.warn(
      { error, companyId },
      "LLM queue classification failed, using fallback"
    );
    return null;
  }
};

const ResolveHandoffQueueService = async ({
  companyId,
  agent,
  conversationText,
  currentQueueId
}: {
  companyId: number;
  agent: AiAgent;
  conversationText: string;
  currentQueueId?: number | null;
}): Promise<QueueMatch> => {
  const keywordMatch = await resolveByKeywords(companyId, conversationText);
  if (keywordMatch && keywordMatch.confidence >= 0.34) {
    return keywordMatch;
  }

  const llmMatch = await resolveByLlm(companyId, conversationText, agent);
  if (llmMatch && llmMatch.confidence >= 0.4) {
    return llmMatch;
  }

  if (keywordMatch) {
    return keywordMatch;
  }

  if (agent.fallbackQueueId) {
    const fallback = await Queue.findByPk(agent.fallbackQueueId);
    return {
      queueId: agent.fallbackQueueId,
      queueName: fallback?.name || "fallback",
      method: "fallback",
      confidence: 0.2,
      reason: "agent_fallback_queue"
    };
  }

  if (currentQueueId) {
    const current = await Queue.findByPk(currentQueueId);
    return {
      queueId: currentQueueId,
      queueName: current?.name || "current",
      method: "fallback",
      confidence: 0.1,
      reason: "current_ticket_queue"
    };
  }

  const firstQueue = await Queue.findOne({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  return {
    queueId: firstQueue?.id || 0,
    queueName: firstQueue?.name || "unknown",
    method: "fallback",
    confidence: 0,
    reason: "first_available_queue"
  };
};

export default ResolveHandoffQueueService;
