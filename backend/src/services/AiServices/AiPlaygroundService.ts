import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import { chatCompletion, createEmbedding } from "./ModelGateway";
import { getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { searchKnowledgeChunks } from "./RetrievalEngine";
import AppError from "../../errors/AppError";

const TOKEN_COST_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  default: { input: 0.15, output: 0.6 }
};

const estimateCostUsd = (
  model: string,
  tokensInput: number,
  tokensOutput: number
): number => {
  const pricing =
    TOKEN_COST_PER_MILLION[model] || TOKEN_COST_PER_MILLION.default;
  return (
    (tokensInput / 1_000_000) * pricing.input +
    (tokensOutput / 1_000_000) * pricing.output
  );
};

export type PlaygroundRequest = {
  companyId: number;
  agentId: number;
  knowledgeBaseId?: number;
  message: string;
};

export type PlaygroundChunk = {
  id: number;
  content: string;
  similarity: number;
  documentTitle?: string;
};

export type PlaygroundResult = {
  response: string;
  agent: { id: number; name: string; model: string };
  knowledgeBaseIds: number[];
  chunks: PlaygroundChunk[];
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  latencyMs: number;
  model: string;
};

export const runPlaygroundQuery = async ({
  companyId,
  agentId,
  knowledgeBaseId,
  message
}: PlaygroundRequest): Promise<PlaygroundResult> => {
  const startedAt = Date.now();
  const agent = await AiAgent.findOne({
    where: { id: agentId, companyId, active: true }
  });

  if (!agent) {
    throw new AppError("Active AI agent not found", 404);
  }

  if (knowledgeBaseId) {
    const base = await KnowledgeBase.findOne({
      where: { id: knowledgeBaseId, companyId, active: true }
    });
    if (!base) {
      throw new AppError("Knowledge base not found", 404);
    }
  }

  const knowledgeBaseIds = knowledgeBaseId
    ? [knowledgeBaseId]
    : await getKnowledgeBaseIdsForAgent(companyId, agent.id);

  let chunks: PlaygroundChunk[] = [];
  let contextBlock =
    "Nenhum trecho indexado na base selecionada. Responda com cordialidade usando o contexto geral do agente.";

  if (knowledgeBaseIds.length) {
    const queryEmbedding = await createEmbedding(
      companyId,
      message,
      agent.provider
    );
    const retrieved = await searchKnowledgeChunks(
      companyId,
      knowledgeBaseIds,
      queryEmbedding,
      5
    );

    chunks = retrieved.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      similarity: chunk.similarity,
      documentTitle: String(chunk.metadata?.documentTitle || "")
    }));

    if (chunks.length) {
      contextBlock = chunks
        .map((chunk, index) => `[Trecho ${index + 1}]\n${chunk.content}`)
        .join("\n\n");
    }
  }

  const systemPrompt = `${agent.basePrompt || ""}

Você é o primeiro atendente virtual da empresa. Seja cordial, objetivo e proativo.
Use a base de conhecimento quando houver trechos relevantes.
Se não houver informação exata na base, responda com educação e peça mais detalhes.
Só sugira transferência para humano se o cliente pedir explicitamente.

Base de conhecimento:
${contextBlock}`;

  const completion = await chatCompletion(companyId, {
    model: agent.textModel,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    providerId: agent.provider,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]
  });

  const latencyMs = Date.now() - startedAt;

  return {
    response: completion.content,
    agent: {
      id: agent.id,
      name: agent.name,
      model: agent.textModel
    },
    knowledgeBaseIds,
    chunks,
    tokensInput: completion.tokensInput,
    tokensOutput: completion.tokensOutput,
    estimatedCostUsd: estimateCostUsd(
      completion.model,
      completion.tokensInput,
      completion.tokensOutput
    ),
    latencyMs,
    model: completion.model
  };
};
