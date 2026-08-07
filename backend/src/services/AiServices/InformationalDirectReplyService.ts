import AiAgent from "../../models/AiAgent";
import Ticket from "../../models/Ticket";
import { chatCompletion } from "./ModelGateway";
import { getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { prepareCustomerFacingAiText } from "./prepareCustomerFacingAiText";
import { logger } from "../../utils/logger";
import Message from "../../models/Message";
import { parsePositiveInt, withAiTimeout } from "./withAiTimeout";
import { resolveAgentInformationalFallback } from "./AgentPersonaService";
import { buildDefaultOperationalRules } from "./AiPromptBuilder";
import { buildContextualRetrievalQuery } from "./ContextualRetrievalQuery";
import { buildConversationAttemptState } from "./ConversationAttemptStateService";
import { dropDuplicatedCurrentTurn } from "./conversationHistoryUtils";

const getKnowledgeLookupTimeoutMs = (): number =>
  parsePositiveInt(process.env.AI_INFORMATIONAL_KNOWLEDGE_TIMEOUT_MS, 8000);

const getInformationalLlmTimeoutMs = (): number =>
  parsePositiveInt(process.env.AI_INFORMATIONAL_LLM_TIMEOUT_MS, 18000);

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

export const resolveBrandFallback = (agent: AiAgent, userText = ""): string =>
  resolveAgentInformationalFallback(agent, userText);

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
  const rawHistory = await buildConversationHistory(ticket.id, 6);
  const history = dropDuplicatedCurrentTurn(rawHistory, userText);
  const retrievalQuery = buildContextualRetrievalQuery(userText, history);
  const attemptState = buildConversationAttemptState(history, userText);

  try {
    const knowledgeContext = await withAiTimeout(
      buildKnowledgeContextForQuery({
        companyId,
        knowledgeBaseIds,
        userText: retrievalQuery,
        provider: agent.provider,
        loadStrategy: "auto",
        skipReingest: true
      }),
      getKnowledgeLookupTimeoutMs(),
      "informational_knowledge_lookup"
    );

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

    try {
      const completion = await withAiTimeout(
        chatCompletion(companyId, {
          model: agent.textModel,
          temperature: Math.min(0.4, agent.temperature ?? 0.3),
          maxTokens: Math.min(640, agent.maxTokens || 1024),
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
                buildDefaultOperationalRules(agent),
                attemptState.promptBlock,
                `Material da base:\n${contextBlock.slice(0, 12000)}`
              ]
                .filter(Boolean)
                .join("\n\n")
            },
            ...history.map(item => ({
              role: item.role,
              content: item.content
            })),
            { role: "user", content: userText }
          ]
        }),
        getInformationalLlmTimeoutMs(),
        "informational_llm_reply"
      );

      const reply = prepareCustomerFacingAiText(
        completion.content?.trim() || "",
        userText,
        agent
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
    body:
      prepareCustomerFacingAiText(brandFallback, userText, agent) ||
      brandFallback,
    knowledgeBaseIds,
    chunkCount,
    hasReadyDocuments,
    reason: "informational_brand_fallback"
  };
};
