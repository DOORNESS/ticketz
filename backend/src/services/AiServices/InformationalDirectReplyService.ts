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
    | "informational_chunk_fallback"
    | "informational_brand_fallback"
    | "empty_reply"
    | "provider_error";
};

const NIVEL_BRAND_FALLBACK =
  "A Nível Cashback ajuda sua empresa a fidelizar clientes: em cada compra o cliente acumula cashback e volta a gastar com você. Posso te explicar o funcionamento para o lojista, para o cliente final, ou os benefícios principais — o que você prefere?";

const FORTMAX_BRAND_FALLBACK =
  "Posso te ajudar com os produtos Fortmax (como WebG3 e FortControl): funcionalidades, uso e suporte. Me diga o que sua empresa precisa resolver que eu te oriento com base no nosso material.";

const GENERIC_BRAND_FALLBACK =
  "Claro — posso te explicar o que nosso produto faz pela sua empresa com base no material deste canal. Me diga se prefere visão geral, benefícios ou como começar.";

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

const resolveBrandFallback = (agent: AiAgent): string => {
  const prompt = `${agent.name || ""} ${agent.basePrompt || ""}`.toLowerCase();
  if (
    prompt.includes("nivelton") ||
    prompt.includes("nível cashback") ||
    prompt.includes("nivel cashback")
  ) {
    return NIVEL_BRAND_FALLBACK;
  }
  if (
    prompt.includes("webin") ||
    prompt.includes("fortmax") ||
    prompt.includes("webg3")
  ) {
    return FORTMAX_BRAND_FALLBACK;
  }
  return GENERIC_BRAND_FALLBACK;
};

const buildChunkFallback = (
  contextBlock: string,
  agent: AiAgent
): string | null => {
  const cleaned = contextBlock.replace(/\[Trecho \d+\]\n?/g, "").trim();
  if (cleaned.length < 40) {
    return null;
  }

  const snippet = cleaned.slice(0, 700).trim();
  return `Com base no nosso material: ${snippet}${
    snippet.length >= 700 ? "…" : ""
  }\n\nSe quiser, eu detalho benefícios para a sua empresa ou o passo a passo de uso.`;
};

/**
 * Caminho estável para dúvidas informativas.
 * Sempre tenta devolver uma resposta ao cliente (LLM → trechos → fallback da marca).
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

  let chunkCount = 0;
  let hasReadyDocuments = false;
  let contextBlock = "";

  try {
    const knowledgeContext = await buildKnowledgeContextForQuery({
      companyId,
      knowledgeBaseIds,
      userText,
      provider: agent.provider,
      loadStrategy: "full"
    });

    chunkCount = knowledgeContext.usedChunks.length;
    hasReadyDocuments = knowledgeContext.hasReadyDocuments;
    contextBlock =
      knowledgeContext.contextBlock ||
      (knowledgeContext.hasReadyDocuments
        ? "Há conteúdo na base deste canal. Explique o produto com o que souber do material, sem inventar preços ou regras."
        : "A base deste canal ainda está limitada. Explique de forma geral e cordial o que puder; peça mais detalhes se necessário.");

    const history = await buildConversationHistory(ticket.id, 6);

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
            "Use o material da base de conhecimento para explicar o que é, como funciona e benefícios para a empresa do cliente.",
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
    if (reply.length >= 20) {
      return {
        replied: true,
        body: reply,
        knowledgeBaseIds,
        chunkCount,
        hasReadyDocuments,
        reason: "informational_direct_knowledge_path"
      };
    }
  } catch (error) {
    logger.warn(
      { error, ticketId: ticket.id, companyId },
      "Informational direct LLM reply failed — using fallback"
    );
  }

  const chunkFallback = buildChunkFallback(contextBlock, agent);
  if (chunkFallback) {
    return {
      replied: true,
      body: sanitizeAiOutboundText(chunkFallback),
      knowledgeBaseIds,
      chunkCount,
      hasReadyDocuments,
      reason: "informational_chunk_fallback"
    };
  }

  const brandFallback = resolveBrandFallback(agent);
  return {
    replied: true,
    body: brandFallback,
    knowledgeBaseIds,
    chunkCount,
    hasReadyDocuments,
    reason: "informational_brand_fallback"
  };
};
