import sequelize from "../../database";
import {
  buildRetrievalSqlParts,
  type RetrievalPolicyMode
} from "./KnowledgeCms/KnowledgeRetrievalPolicy";

export type RetrievedChunk = {
  id: number;
  content: string;
  knowledgeDocumentId: number;
  metadata: Record<string, unknown>;
  similarity: number;
};

const mergeRetrievedChunks = (
  chunks: RetrievedChunk[],
  limit: number
): RetrievedChunk[] => {
  const merged = new Map<number, RetrievedChunk>();

  chunks.forEach(chunk => {
    const existing = merged.get(chunk.id);
    if (!existing || chunk.similarity > existing.similarity) {
      merged.set(chunk.id, chunk);
    }
  });

  return [...merged.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};

const searchKnowledgeChunksWithMode = async (
  mode: RetrievalPolicyMode,
  companyId: number,
  knowledgeBaseIds: number[],
  queryEmbedding: number[],
  limit = 5
): Promise<RetrievedChunk[]> => {
  const policy = buildRetrievalSqlParts(mode);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const [results] = await sequelize.query(
    `
    SELECT
      kc.id,
      kc.content,
      ${policy.selectDocumentId} AS "knowledgeDocumentId",
      kc.metadata,
      1 - (kc.embedding <=> :embedding::vector) AS similarity
    FROM "KnowledgeChunks" kc
    ${policy.joins}
    WHERE kc."companyId" = :companyId
      ${policy.where}
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> :embedding::vector
    LIMIT :limit
    `,
    {
      replacements: {
        companyId,
        knowledgeBaseIds,
        embedding: embeddingLiteral,
        limit
      }
    }
  );

  return (results as RetrievedChunk[]) || [];
};

export const searchKnowledgeChunks = async (
  companyId: number,
  knowledgeBaseIds: number[],
  queryEmbedding: number[],
  limit = 5
): Promise<RetrievedChunk[]> => {
  if (!knowledgeBaseIds.length) {
    return [];
  }

  const [cmsResults, legacyResults] = await Promise.all([
    searchKnowledgeChunksWithMode(
      "cms",
      companyId,
      knowledgeBaseIds,
      queryEmbedding,
      limit
    ),
    searchKnowledgeChunksWithMode(
      "legacy",
      companyId,
      knowledgeBaseIds,
      queryEmbedding,
      limit
    )
  ]);

  return mergeRetrievedChunks([...cmsResults, ...legacyResults], limit);
};

export const searchKnowledgeChunksByText = async (
  companyId: number,
  knowledgeBaseIds: number[],
  query: string,
  limit = 5
): Promise<RetrievedChunk[]> => {
  if (!knowledgeBaseIds.length) {
    return [];
  }

  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .filter(term => term.length >= 4)
    .slice(0, 6);

  if (!terms.length) {
    return [];
  }

  const searchByTextWithMode = async (
    mode: RetrievalPolicyMode
  ): Promise<RetrievedChunk[]> => {
    const policy = buildRetrievalSqlParts(mode);
    const conditions = terms
      .map((_, index) => `lower(kc.content) LIKE :term${index}`)
      .join(" OR ");

    const replacements: Record<string, unknown> = {
      companyId,
      knowledgeBaseIds,
      limit
    };

    terms.forEach((term, index) => {
      replacements[`term${index}`] = `%${term}%`;
    });

    const [results] = await sequelize.query(
      `
      SELECT
        kc.id,
        kc.content,
        ${policy.selectDocumentId} AS "knowledgeDocumentId",
        kc.metadata,
        0.45 AS similarity
      FROM "KnowledgeChunks" kc
      ${policy.joins}
      WHERE kc."companyId" = :companyId
        ${policy.where}
        AND (${conditions})
      LIMIT :limit
      `,
      { replacements }
    );

    return (results as RetrievedChunk[]) || [];
  };

  const [cmsResults, legacyResults] = await Promise.all([
    searchByTextWithMode("cms"),
    searchByTextWithMode("legacy")
  ]);

  return mergeRetrievedChunks([...cmsResults, ...legacyResults], limit);
};

export const retrieveKnowledgeForQuery = async (
  companyId: number,
  knowledgeBaseIds: number[],
  query: string,
  queryEmbedding: number[],
  limit = 5
): Promise<RetrievedChunk[]> => {
  const [vectorResults, keywordResults] = await Promise.all([
    searchKnowledgeChunks(companyId, knowledgeBaseIds, queryEmbedding, limit),
    searchKnowledgeChunksByText(companyId, knowledgeBaseIds, query, limit)
  ]);

  const merged = new Map<number, RetrievedChunk>();

  [...vectorResults, ...keywordResults].forEach(chunk => {
    const existing = merged.get(chunk.id);
    if (!existing || chunk.similarity > existing.similarity) {
      merged.set(chunk.id, chunk);
    }
  });

  return [...merged.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};
