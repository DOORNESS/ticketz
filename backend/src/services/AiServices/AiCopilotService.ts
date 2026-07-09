import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiCopilotSuggestion from "../../models/AiCopilotSuggestion";
import { chatCompletion } from "./ModelGateway";
import { getActiveAgent, getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { isAiFeaturesEnabled } from "./AiPlatformState";

const COPILOT_SYSTEM = `Você é copiloto silencioso de atendentes humanos.
NUNCA envie mensagens ao cliente.
Analise a conversa e sugira a melhor resposta para o atendente copiar ou enviar.
Responda APENAS em JSON válido:
{
  "suggestedResponse": "texto sugerido",
  "rationale": "por que essa resposta",
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
  rationale: string;
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
      rationale: String(parsed.rationale || ""),
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
  Boolean(ticket.aiStartedAt || ticket.aiHandoff);

export const generateCopilotSuggestion = async ({
  ticket,
  agent
}: {
  ticket: Ticket;
  agent?: AiAgent | null;
}): Promise<AiCopilotSuggestion | null> => {
  if (!shouldRunCopilot(ticket)) {
    return null;
  }

  const activeAgent =
    agent || (await getActiveAgent(ticket.companyId, ticket.queueId));
  if (!activeAgent) {
    return null;
  }

  try {
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
            "Gere sugestão para a última mensagem do cliente."
          ].join("\n\n")
        }
      ]
    });

    const parsed = parseCopilotJson(completion.content || "");
    if (!parsed) {
      return null;
    }

    const topSimilarity = knowledgeContext.usedChunks[0]?.similarity || 0;
    const confidence = Math.max(parsed.confidence, topSimilarity);

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
      suggestedResponse: parsed.suggestedResponse,
      rationale: parsed.rationale,
      usedChunks: knowledgeContext.usedChunks,
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
    logger.warn(
      { error, ticketId: ticket.id },
      "generateCopilotSuggestion failed"
    );
    return null;
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
