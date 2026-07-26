import AiAgent from "../../models/AiAgent";
import Ticket from "../../models/Ticket";
import { chatCompletion } from "./ModelGateway";
import { getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";
import { logger } from "../../utils/logger";
import Message from "../../models/Message";

export type InformationalDirectReplyResult = {
  replied: boolean;
  body?: string;
  knowledgeBaseIds: number[];
  chunkCount: number;
  hasReadyDocuments: boolean;
  reason:
    | "informational_direct_knowledge_path"
    | "empty_reply"
    | "provider_error";
};

const buildConversationHistory = async (
  ticketId: number,
  limit = 6
): Promise<{ role: "user" | "assistant"; content: string }[]> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]],
    limit
  });

  return messages
    .reverse()
    .filter(msg => Boolean(msg.body?.trim()))
    .filter(msg => {
      if (!msg.fromMe) {
        return true;
      }
      const body = msg.body || "";
      if (
        body.includes("Protocolo:") &&
        body.toLowerCase().includes("suporte técnico")
      ) {
        return false;
      }
      return true;
    })
    .map(msg => ({
      role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
      content: msg.body
    }));
};

/**
 * Caminho estável para dúvidas informativas: base + LLM, sem triagem/tools.
 * Mantém o robô conversando após a saudação.
 */
export const tryInformationalDirectReply = async ({
  companyId,
  ticket,
  agent,
  userText
}: {
  companyId: number;
  ticket: Ticket;
  agent: AiAgent;
  userText: string;
}): Promise<InformationalDirectReplyResult> => {
  const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
    companyId,
    agent.id,
    ticket.queueId
  );

  try {
    const knowledgeContext = await buildKnowledgeContextForQuery({
      companyId,
      knowledgeBaseIds,
      userText,
      provider: agent.provider,
      loadStrategy: "full"
    });

    const history = await buildConversationHistory(ticket.id, 6);
    const contextBlock =
      knowledgeContext.contextBlock ||
      (knowledgeContext.hasReadyDocuments
        ? "Há conteúdo na base deste canal. Explique o produto com o que souber do material, sem inventar preços ou regras."
        : "A base deste canal ainda está limitada. Explique de forma geral e cordial o que puder; peça mais detalhes se necessário.");

    const completion = await chatCompletion(companyId, {
      model: agent.textModel,
      temperature: Math.min(0.4, agent.temperature ?? 0.3),
      maxTokens: Math.min(2048, agent.maxTokens || 1024),
      providerId: agent.provider,
      messages: [
        {
          role: "system",
          content: [
            agent.basePrompt?.trim() ||
              "Você é o assistente virtual deste canal de atendimento.",
            "Responda em português, de forma clara e conversacional.",
            "Use o material da base de conhecimento para explicar o que é, como funciona e benefícios.",
            "Não invente políticas, valores ou procedimentos que não estejam no material.",
            "Não transfira para humano nesta resposta — continue a conversa e ofereça ajudar com a próxima dúvida.",
            `Material da base:\n${contextBlock}`
          ].join("\n\n")
        },
        ...history.map(item => ({
          role: item.role,
          content: item.content
        })),
        { role: "user", content: userText }
      ]
    });

    const reply = sanitizeAiOutboundText(completion.content?.trim() || "");
    if (reply.length < 20) {
      return {
        replied: false,
        knowledgeBaseIds,
        chunkCount: knowledgeContext.usedChunks.length,
        hasReadyDocuments: knowledgeContext.hasReadyDocuments,
        reason: "empty_reply"
      };
    }

    return {
      replied: true,
      body: reply,
      knowledgeBaseIds,
      chunkCount: knowledgeContext.usedChunks.length,
      hasReadyDocuments: knowledgeContext.hasReadyDocuments,
      reason: "informational_direct_knowledge_path"
    };
  } catch (error) {
    logger.warn(
      { error, ticketId: ticket.id, companyId },
      "Informational direct reply failed"
    );
    return {
      replied: false,
      knowledgeBaseIds,
      chunkCount: 0,
      hasReadyDocuments: false,
      reason: "provider_error"
    };
  }
};
