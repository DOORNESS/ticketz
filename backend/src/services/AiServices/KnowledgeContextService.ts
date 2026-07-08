import { Op } from "sequelize";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import { createEmbedding } from "./ModelGateway";
import {
  retrieveKnowledgeForQuery,
  searchKnowledgeChunksByText,
  RetrievedChunk
} from "./RetrievalEngine";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { logger } from "../../utils/logger";

const MAX_CONTEXT_CHARS = 14000;
const MAX_CHUNK_SNIPPET = 900;

export type KnowledgeContextResult = {
  contextBlock: string;
  usedChunks: { id: number; content: string; similarity: number }[];
  hasReadyDocuments: boolean;
  reingestedDocuments: number;
};

const mapChunks = (chunks: RetrievedChunk[]) =>
  chunks.map(chunk => ({
    id: chunk.id,
    content: chunk.content.slice(0, MAX_CHUNK_SNIPPET),
    similarity: chunk.similarity
  }));

const buildContextBlock = (
  chunks: { id: number; content: string; similarity: number }[]
): string =>
  chunks
    .map((chunk, idx) => `[Trecho ${idx + 1}]\n${chunk.content}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

const loadAllReadyChunkTexts = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<{ id: number; content: string; similarity: number }[]> => {
  const rows = await KnowledgeChunk.findAll({
    where: { companyId },
    include: [
      {
        model: KnowledgeDocument,
        required: true,
        where: {
          companyId,
          knowledgeBaseId: { [Op.in]: knowledgeBaseIds },
          status: "ready"
        },
        attributes: ["id", "title"]
      }
    ],
    order: [["id", "ASC"]],
    limit: 24
  });

  return rows.map(row => ({
    id: row.id,
    content: row.content.slice(0, MAX_CHUNK_SNIPPET),
    similarity: 0.4
  }));
};

const reingestPendingDocuments = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<number> => {
  const pendingDocs = await KnowledgeDocument.findAll({
    where: {
      companyId,
      knowledgeBaseId: { [Op.in]: knowledgeBaseIds },
      status: { [Op.in]: ["pending", "error", "processing"] }
    },
    limit: 5,
    order: [["updatedAt", "ASC"]]
  });

  let ingested = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const document of pendingDocs) {
    try {
      await ingestKnowledgeDocument(document.id, companyId);
      ingested += 1;
    } catch (error) {
      logger.warn(
        { error, documentId: document.id, companyId },
        "Failed to re-ingest knowledge document before AI reply"
      );
    }
  }

  return ingested;
};

export const buildKnowledgeContextForQuery = async ({
  companyId,
  knowledgeBaseIds,
  userText,
  provider
}: {
  companyId: number;
  knowledgeBaseIds: number[];
  userText: string;
  provider?: string;
}): Promise<KnowledgeContextResult> => {
  if (!knowledgeBaseIds.length) {
    return {
      contextBlock: "",
      usedChunks: [],
      hasReadyDocuments: false,
      reingestedDocuments: 0
    };
  }

  const readyCount = await KnowledgeDocument.count({
    where: {
      companyId,
      knowledgeBaseId: { [Op.in]: knowledgeBaseIds },
      status: "ready"
    }
  });

  let reingestedDocuments = 0;

  if (readyCount === 0) {
    reingestedDocuments = await reingestPendingDocuments(
      companyId,
      knowledgeBaseIds
    );
  }

  if (readyCount > 0 && readyCount <= 4) {
    const usedChunks = await loadAllReadyChunkTexts(companyId, knowledgeBaseIds);
    return {
      contextBlock: buildContextBlock(usedChunks),
      usedChunks,
      hasReadyDocuments: usedChunks.length > 0,
      reingestedDocuments
    };
  }

  let merged: RetrievedChunk[] = [];

  try {
    const queryEmbedding = await createEmbedding(companyId, userText, provider);
    merged = await retrieveKnowledgeForQuery(
      companyId,
      knowledgeBaseIds,
      userText,
      queryEmbedding,
      8
    );
  } catch (error) {
    logger.warn(
      { error, companyId },
      "Vector knowledge search failed, falling back to keyword search"
    );
    merged = await searchKnowledgeChunksByText(
      companyId,
      knowledgeBaseIds,
      userText,
      8
    );
  }

  if (!merged.length) {
    merged = await searchKnowledgeChunksByText(
      companyId,
      knowledgeBaseIds,
      "fortmax webg3 mercado 1998 esquadrias vidro",
      8
    );
  }

  let usedChunks = mapChunks(merged);

  if (!usedChunks.length) {
    usedChunks = await loadAllReadyChunkTexts(companyId, knowledgeBaseIds);
  }

  const hasReadyDocuments =
    readyCount > 0 || reingestedDocuments > 0 || usedChunks.length > 0;

  return {
    contextBlock: buildContextBlock(usedChunks),
    usedChunks,
    hasReadyDocuments,
    reingestedDocuments
  };
};
