import AiAgent from "../../models/AiAgent";
import Ticket from "../../models/Ticket";
import { chatCompletion } from "./ModelGateway";
import { getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";
import { prepareCustomerFacingAiText } from "./prepareCustomerFacingAiText";
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

const INSTRUCTION_PLACEHOLDER_MARKERS = [
  "A base deste canal ainda está limitada",
  "Há conteúdo na base deste canal. Explique o produto"
];

const isInstructionPlaceholder = (text: string): boolean =>
  INSTRUCTION_PLACEHOLDER_MARKERS.some(marker => text.includes(marker));

const hasRealKnowledgeContext = (contextBlock: string): boolean =>
  Boolean(contextBlock.trim()) &&
  !isInstructionPlaceholder(contextBlock) &&
  (contextBlock.includes("[Trecho") || contextBlock.length >= 80);

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

const resolveBrandFallback = (agent: AiAgent, userText = ""): string => {
  const combined =
    `${agent.name || ""} ${agent.basePrompt || ""} ${userText}`.toLowerCase();
  if (
    combined.includes("nivelton") ||
    combined.includes("nível cashback") ||
    combined.includes("nivel cashback") ||
    combined.includes("nível") ||
    combined.includes("nivel") ||
    combined.includes("cashback")
  ) {
    return NIVEL_BRAND_FALLBACK;
  }
  if (
    combined.includes("webin") ||
    combined.includes("fortmax") ||
    combined.includes("webg3")
  ) {
    return FORTMAX_BRAND_FALLBACK;
  }
  return GENERIC_BRAND_FALLBACK;
};

/**
 * Caminho estável para dúvidas informativas.
 * Sempre tenta devolver uma resposta ao cliente (LLM → fallback da marca).
 * Nunca envia trechos crus da base — evita vazar instruções internas do agente.
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

    if (!hasRealKnowledgeContext(contextBlock)) {
      const brandFallback = resolveBrandFallback(agent, userText);
      return {
        replied: true,
        body: brandFallback,
        knowledgeBaseIds,
        chunkCount,
        hasReadyDocuments,
        reason: "informational_brand_fallback"
      };
    }

    const history = await buildConversationHistory(ticket.id, 4);

    try {
      const completion = await chatCompletion(companyId, {
        model: agent.textModel,
        temperature: Math.min(0.4, agent.temperature ?? 0.3),
        maxTokens: Math.min(768, agent.maxTokens || 1024),
        providerId: agent.provider,
        messages: [
          {
            role: "system",
            content: [
              agent.basePrompt?.trim() ||
                "Você é o assistente virtual deste canal de atendimento.",
              "Responda em português, de forma clara e conversacional.",
              "Use o material da base de conhecimento abaixo.",
              "Não invente políticas, valores ou procedimentos que não estejam no material.",
              `Material da base:\n${contextBlock.slice(0, 12000)}`
            ].join("\n\n")
          },
          ...history.map(item => ({
            role: item.role,
            content: item.content
          })),
          { role: "user", content: userText }
        ]
      });

      const reply = prepareCustomerFacingAiText(
        sanitizeAiOutboundText(completion.content?.trim() || ""),
        userText
      );
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
        "Informational direct LLM reply failed — using brand fallback"
      );
    }
  } catch (error) {
    logger.warn(
      { error, ticketId: ticket.id, companyId },
      "Informational direct knowledge lookup failed — using brand fallback"
    );
  }

  const brandFallback = resolveBrandFallback(agent, userText);
  return {
    replied: true,
    body: prepareCustomerFacingAiText(brandFallback, userText) || brandFallback,
    knowledgeBaseIds,
    chunkCount,
    hasReadyDocuments,
    reason: "informational_brand_fallback"
  };
};
