import AiAgent from "../../models/AiAgent";
import AppError from "../../errors/AppError";
import {
  getKnowledgeBaseIdsForAgent,
  getSpecialtyPromptRules
} from "./AiHelpers";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { searchKnowledgeChunks } from "./RetrievalEngine";
import { createEmbedding } from "./ModelGateway";
import { buildAiSystemPrompt } from "./AiPromptBuilder";
import { loadVerifiedMemoryForPrompt } from "./ContactMemory/ContactAiMemoryService";
import { isContactMemoryEnabledForCompany } from "./ContactMemory/AiContactMemoryFeatureFlag";
import { isToolsEnabledForCompany } from "./tools/AiToolsFeatureFlag";
import { isWriteToolsEnabledForCompany } from "./tools/AiWriteToolsFeatureFlag";
import { runToolLoop } from "./tools/ToolLoopService";
import "./tools/registerPilotTools";

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
  toolCallsExecuted?: number;
  handoffTriggered?: boolean;
};

export const generateSpecialistAiReply = async ({
  companyId,
  agent,
  userText,
  queueId,
  orchestratorMode,
  ticketId,
  contactId
}: {
  companyId: number;
  agent: AiAgent;
  userText: string;
  queueId?: number;
  orchestratorMode: boolean;
  ticketId?: number;
  contactId?: number;
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

  const [verifiedMemory, memoryEnabled, toolsEnabled, writeToolsEnabled] =
    await Promise.all([
      contactId && (await isContactMemoryEnabledForCompany(companyId))
        ? loadVerifiedMemoryForPrompt(companyId, contactId)
        : Promise.resolve([]),
      isContactMemoryEnabledForCompany(companyId),
      isToolsEnabledForCompany(companyId),
      isWriteToolsEnabledForCompany(companyId)
    ]);

  const systemPrompt = buildAiSystemPrompt({
    agent,
    specialtyRules: getSpecialtyPromptRules(agent.specialty),
    knowledgeContextBlock: contextBlock,
    verifiedMemory: memoryEnabled ? verifiedMemory : [],
    toolsEnabled,
    writeToolsEnabled
  });

  const loopResult = await runToolLoop({
    companyId,
    agent,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    context: {
      companyId,
      aiAgentId: agent.id,
      ticketId: ticketId || 0,
      contactId: contactId || 0,
      userText,
      knowledgeBaseIds,
      providerId: agent.provider
    }
  });

  if (!loopResult.content?.trim() && !loopResult.handoffTriggered) {
    throw new AppError("Empty AI response", 502);
  }

  return {
    response:
      loopResult.content?.trim() ||
      "Transferência para atendimento humano iniciada.",
    agent,
    knowledgeBaseIds,
    chunks,
    tokensInput: loopResult.tokensInput,
    tokensOutput: loopResult.tokensOutput,
    model: loopResult.model,
    latencyMs: Date.now() - startedAt,
    systemPrompt,
    toolCallsExecuted: loopResult.toolCallsExecuted,
    handoffTriggered: loopResult.handoffTriggered
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
