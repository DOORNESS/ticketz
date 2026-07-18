import AiAgent from "../../models/AiAgent";
import { chatCompletion, createEmbedding } from "./ModelGateway";
import {
  getKnowledgeBaseIdsForAgent,
  getSpecialtyPromptRules
} from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { searchKnowledgeChunks } from "./RetrievalEngine";
import AppError from "../../errors/AppError";

const DEFAULT_SYSTEM_RULES = `
Você é o primeiro atendente virtual da Fortmax Sistemas. Mantenha conversa contínua: responda TODA mensagem do cliente.
Use a base de conhecimento abaixo como fonte principal — se o dado estiver lá, cite-o.
Não repita saudações genéricas se o cliente já fez uma pergunta; responda a pergunta.
Se faltar um detalhe, faça perguntas objetivas e continue ajudando — não encerre o atendimento.
NUNCA diga que vai transferir, encaminhar ou chamar especialista, a menos que o cliente peça atendente/humano explicitamente.
Nunca invente preços, prazos ou políticas que não estejam no contexto.
Responda em português do Brasil.
`;

export type SpecialistReplyChunk = {
  id: number;
  content: string;
  similarity: number;
  documentTitle?: string;
};

export type SpecialistReplyResult = {
  response: string;
  agent: AiAgent;
  knowledgeBaseIds: number[];
  chunks: SpecialistReplyChunk[];
  tokensInput: number;
  tokensOutput: number;
  model: string;
  latencyMs: number;
  systemPrompt: string;
};

export const generateSpecialistAiReply = async ({
  companyId,
  agent,
  userText,
  queueId,
  orchestratorMode
}: {
  companyId: number;
  agent: AiAgent;
  userText: string;
  queueId?: number;
  orchestratorMode: boolean;
}): Promise<SpecialistReplyResult> => {
  const startedAt = Date.now();

  const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
    companyId,
    agent.id,
    queueId,
    { orchestratorMode }
  );

  let chunks: SpecialistReplyChunk[] = [];
  let contextBlock =
    "Base de conhecimento ainda sem documentos prontos. Responda com cordialidade e peça detalhes.";

  if (knowledgeBaseIds.length) {
    const knowledgeContext = await buildKnowledgeContextForQuery({
      companyId,
      knowledgeBaseIds,
      userText,
      provider: agent.provider
    });

    chunks = knowledgeContext.usedChunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      similarity: chunk.similarity,
      documentTitle: chunk.documentTitle
    }));

    contextBlock = knowledgeContext.contextBlock
      ? knowledgeContext.contextBlock
      : knowledgeContext.hasReadyDocuments
        ? "Documentos existem na base, mas nenhum trecho foi recuperado. Responda com base no histórico e peça detalhes se necessário."
        : contextBlock;
  }

  const systemPrompt = [
    agent.basePrompt || "",
    getSpecialtyPromptRules(agent.specialty),
    DEFAULT_SYSTEM_RULES,
    `Base de conhecimento:\n${contextBlock}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await chatCompletion(companyId, {
    model: agent.textModel,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    providerId: agent.provider,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ]
  });

  if (!completion.content?.trim()) {
    throw new AppError("Empty AI response", 502);
  }

  return {
    response: completion.content.trim(),
    agent,
    knowledgeBaseIds,
    chunks,
    tokensInput: completion.tokensInput || 0,
    tokensOutput: completion.tokensOutput || 0,
    model: completion.model,
    latencyMs: Date.now() - startedAt,
    systemPrompt
  };
};

export const searchKnowledgePreview = async ({
  companyId,
  agent,
  userText,
  queueId,
  orchestratorMode,
  limit = 5
}: {
  companyId: number;
  agent: AiAgent;
  userText: string;
  queueId?: number;
  orchestratorMode: boolean;
  limit?: number;
}): Promise<{ knowledgeBaseIds: number[]; chunks: SpecialistReplyChunk[] }> => {
  const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
    companyId,
    agent.id,
    queueId,
    { orchestratorMode }
  );

  if (!knowledgeBaseIds.length) {
    return { knowledgeBaseIds: [], chunks: [] };
  }

  const queryEmbedding = await createEmbedding(
    companyId,
    userText,
    agent.provider
  );
  const retrieved = await searchKnowledgeChunks(
    companyId,
    knowledgeBaseIds,
    queryEmbedding,
    limit
  );

  return {
    knowledgeBaseIds,
    chunks: retrieved.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      similarity: chunk.similarity,
      documentTitle: String(chunk.metadata?.documentTitle || "")
    }))
  };
};
