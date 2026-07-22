import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiCopilotSuggestion from "../../models/AiCopilotSuggestion";
import AppError from "../../errors/AppError";
import { chatCompletion } from "./ModelGateway";
import { getActiveAgent, getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { searchRepositoryForAi } from "../ContentRepository/ContentRepositoryService";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { isAiFeaturesEnabled } from "./AiPlatformState";

export type CopilotStyle =
  | "default"
  | "short"
  | "technical"
  | "cordial"
  | "objective";

const STYLE_PROMPTS: Record<CopilotStyle, string> = {
  default: "Tom profissional padrão.",
  short: "Resposta curta e direta, no máximo 2 frases.",
  technical: "Tom técnico, preciso, com termos corretos do domínio.",
  cordial: "Tom cordial, empático e acolhedor.",
  objective: "Tom objetivo, sem floreios, focado na solução."
};

const COPILOT_SYSTEM = `Você é copiloto silencioso de atendentes humanos.
NUNCA envie mensagens ao cliente.
Analise a conversa e auxilie o atendente com sugestões.
Responda APENAS em JSON válido:
{
  "suggestedResponse": "resposta pronta para o atendente",
  "improvedResponse": "versão melhorada da última resposta do atendente, se houver",
  "rationale": "por que essa resposta",
  "relatedDocument": "documento ou tópico relacionado",
  "nextSteps": "possíveis próximos passos",
  "riskAssessment": "risco identificado ou nenhum",
  "customerSentiment": "positivo|neutro|negativo|frustrado",
  "confidence": 0.0
}
confidence entre 0 e 1.`;

const buildHistory = async (ticketId: number) => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]],
    limit: 12
  });

  return messages
    .reverse()
    .map(msg => `${msg.fromMe ? "Atendente/IA" : "Cliente"}: ${msg.body}`)
    .join("\n");
};

const parseCopilotJson = (
  raw: string
): {
  suggestedResponse: string;
  improvedResponse: string;
  rationale: string;
  relatedDocument: string;
  nextSteps: string;
  riskAssessment: string;
  customerSentiment: string;
  confidence: number;
} | null => {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.suggestedResponse) {
      return null;
    }

    return {
      suggestedResponse: String(parsed.suggestedResponse),
      improvedResponse: String(parsed.improvedResponse || ""),
      rationale: String(parsed.rationale || ""),
      relatedDocument: String(parsed.relatedDocument || ""),
      nextSteps: String(parsed.nextSteps || ""),
      riskAssessment: String(parsed.riskAssessment || ""),
      customerSentiment: String(parsed.customerSentiment || ""),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5))
    };
  } catch {
    return null;
  }
};

export const shouldRunCopilot = (ticket: Ticket): boolean =>
  isAiFeaturesEnabled() &&
  Boolean(ticket.userId) &&
  ticket.status === "open" &&
  Boolean(
    ticket.aiStartedAt ||
    ticket.aiHandoff ||
    ticket.aiAgentId ||
    ticket.aiHumanAssumedAt
  );

export const generateCopilotSuggestion = async ({
  ticket,
  agent,
  instruction,
  requestedByUserId,
  style = "default"
}: {
  ticket: Ticket;
  agent?: AiAgent | null;
  instruction?: string;
  requestedByUserId?: number;
  style?: CopilotStyle;
}): Promise<AiCopilotSuggestion | null> => {
  if (!shouldRunCopilot(ticket) && !instruction) {
    return null;
  }

  if (instruction && !ticket.userId) {
    return null;
  }

  if (!isAiFeaturesEnabled()) {
    throw new AppError("ERR_AI_PLATFORM_NOT_READY", 503);
  }

  const activeAgent =
    agent ||
    (ticket.aiAgentId ? await AiAgent.findByPk(ticket.aiAgentId) : null) ||
    (await getActiveAgent(ticket.companyId, ticket.queueId));
  if (!activeAgent) {
    throw new AppError("ERR_AI_AGENT_NOT_FOUND", 422);
  }

  try {
    if (requestedByUserId) {
      await ticket.update({
        aiAssistActive: true,
        aiAssistMode: "private",
        aiAssistRequestedAt: new Date(),
        aiAssistRequestedBy: requestedByUserId,
        aiAssistAgentId: activeAgent.id
      } as any);
    }

    const history = await buildHistory(ticket.id);
    const latestUser = await Message.findOne({
      where: { ticketId: ticket.id, fromMe: false },
      order: [["createdAt", "DESC"]]
    });

    const userText = latestUser?.body || "";
    const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
      ticket.companyId,
      activeAgent.id,
      ticket.queueId
    );

    const knowledgeContext = await buildKnowledgeContextForQuery({
      companyId: ticket.companyId,
      knowledgeBaseIds,
      userText,
      provider: activeAgent.provider
    });

    const repositoryMatches = await searchRepositoryForAi({
      companyId: ticket.companyId,
      query: userText || instruction || ticket.id.toString(),
      queueId: ticket.queueId || undefined,
      aiAgentId: activeAgent.id,
      limit: 5
    });

    const repositoryBlock =
      repositoryMatches.length > 0
        ? repositoryMatches
            .map(
              item =>
                `- [${item.id}] ${item.displayTitle || item.name} (${item.contentType})`
            )
            .join("\n")
        : "sem itens do repositório";

    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.default;

    const completion = await chatCompletion(ticket.companyId, {
      model: activeAgent.textModel,
      temperature: 0.3,
      maxTokens: 700,
      providerId: activeAgent.provider,
      messages: [
        { role: "system", content: COPILOT_SYSTEM },
        {
          role: "user",
          content: [
            `Histórico:\n${history}`,
            `Base de conhecimento:\n${knowledgeContext.contextBlock || "sem contexto"}`,
            `Repositório (materiais disponíveis):\n${repositoryBlock}`,
            `Estilo solicitado: ${stylePrompt}`,
            instruction
              ? `Instrução do atendente:\n${instruction}`
              : "Gere sugestão para a última mensagem do cliente."
          ].join("\n\n")
        }
      ]
    });

    const parsed = parseCopilotJson(completion.content || "");
    const fallbackText = (completion.content || "").trim();
    const parsedOrFallback =
      parsed ||
      (fallbackText
        ? {
            suggestedResponse: fallbackText.slice(0, 2000),
            improvedResponse: "",
            rationale: "Resposta gerada sem JSON estruturado.",
            relatedDocument: "",
            nextSteps: "",
            riskAssessment: "",
            customerSentiment: "",
            confidence: 0.5
          }
        : null);

    if (!parsedOrFallback) {
      return null;
    }

    const topSimilarity = knowledgeContext.usedChunks[0]?.similarity || 0;
    const confidence = Math.max(parsedOrFallback.confidence, topSimilarity);

    await AiCopilotSuggestion.update(
      { status: "superseded" },
      {
        where: {
          ticketId: ticket.id,
          companyId: ticket.companyId,
          status: "pending"
        }
      }
    );

    const suggestion = await AiCopilotSuggestion.create({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      suggestedResponse: parsedOrFallback.suggestedResponse,
      improvedResponse: parsedOrFallback.improvedResponse,
      rationale: parsedOrFallback.rationale,
      relatedDocument: parsedOrFallback.relatedDocument,
      nextSteps: parsedOrFallback.nextSteps,
      riskAssessment: parsedOrFallback.riskAssessment,
      customerSentiment: parsedOrFallback.customerSentiment,
      usedChunks: [
        ...knowledgeContext.usedChunks,
        ...repositoryMatches.map(item => ({
          documentTitle: item.displayTitle || item.name,
          topic: `Repositório #${item.id}`,
          similarity: 0.5,
          source: "repository"
        }))
      ],
      confidence,
      status: "pending"
    });

    const io = getIO();
    io.to(ticket.id.toString())
      .to(`company-${ticket.companyId}-mainchannel`)
      .emit(`company-${ticket.companyId}-ai-copilot`, {
        action: "update",
        ticketId: ticket.id,
        suggestion
      });

    return suggestion;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.warn(
      { error, ticketId: ticket.id },
      "generateCopilotSuggestion failed"
    );
    throw new AppError("ERR_COPILOT_SUGGESTION_FAILED", 422);
  }
};

export const getLatestCopilotSuggestion = async (
  ticketId: number,
  companyId: number
): Promise<AiCopilotSuggestion | null> =>
  AiCopilotSuggestion.findOne({
    where: { ticketId, companyId, status: "pending" },
    order: [["createdAt", "DESC"]]
  });

export const markCopilotSuggestionStatus = async ({
  suggestionId,
  companyId,
  status
}: {
  suggestionId: number;
  companyId: number;
  status: "ignored" | "sent" | "copied";
}): Promise<void> => {
  await AiCopilotSuggestion.update(
    { status },
    { where: { id: suggestionId, companyId } }
  );
};
