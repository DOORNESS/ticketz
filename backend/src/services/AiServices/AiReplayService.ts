import AiReplayLog from "../../models/AiReplayLog";
import Ticket from "../../models/Ticket";
import { estimateAiCostUsd } from "./AiMetricsHelper";

export type ReplayLogInput = {
  companyId: number;
  ticketId: number;
  messageId?: string;
  userQuestion?: string;
  conversationHistory?: object;
  systemPrompt?: string;
  usedChunks?: object;
  aiResponse?: string;
  confidence?: number;
  explainability?: object;
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs?: number;
  model?: string;
  mediaType?: string;
  visionSummary?: string;
  ocrText?: string;
};

export const persistAiReplayLog = async (
  input: ReplayLogInput
): Promise<AiReplayLog> => {
  const costUsd = estimateAiCostUsd(
    input.model,
    input.tokensInput || 0,
    input.tokensOutput || 0
  );

  const log = await AiReplayLog.create({
    ...input,
    costUsd
  });

  if (input.explainability) {
    await Ticket.update(
      { aiLastExplainability: input.explainability },
      { where: { id: input.ticketId, companyId: input.companyId } }
    );
  }

  return log;
};

export const listAiReplayLogs = async ({
  companyId,
  ticketId,
  limit = 50,
  offset = 0
}: {
  companyId: number;
  ticketId?: number;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AiReplayLog[]; count: number }> => {
  const where: Record<string, unknown> = { companyId };
  if (ticketId) {
    where.ticketId = ticketId;
  }

  const { rows, count } = await AiReplayLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count };
};

export const getAiReplayLog = async (
  id: number,
  companyId: number
): Promise<AiReplayLog | null> =>
  AiReplayLog.findOne({ where: { id, companyId } });

export const buildExplainability = ({
  confidence,
  usedChunks,
  extraSources = []
}: {
  confidence: number;
  usedChunks: Array<{
    documentTitle?: string;
    topic?: string;
    similarity?: number;
  }>;
  extraSources?: string[];
}) => ({
  confidence,
  sources: [
    ...usedChunks.map(chunk => ({
      type: "knowledge",
      label: chunk.documentTitle || chunk.topic || "Documento",
      similarity: chunk.similarity || 0
    })),
    ...extraSources.map(label => ({ type: "context", label }))
  ]
});
