import sequelize from "../../database";
import {
  buildRetrievalSqlParts,
  type RetrievalPolicyMode
} from "./KnowledgeCms/KnowledgeRetrievalPolicy";
import {
  getRagMinimumSimilarity,
  getRagNeighborWindow,
  RAG_RETRIEVAL_CANDIDATE_LIMIT
} from "./RagConfig";

export type RetrievedChunk = {
  id: number;
  content: string;
  knowledgeDocumentId: number;
  knowledgeAssetId?: number | null;
  knowledgeAssetVersionId?: number | null;
  metadata: Record<string, unknown>;
  similarity: number;
};

const normalizeTerms = (text: string, limit?: number): string[] => {
  const terms = [
    ...new Set(
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/i)
        .filter(term => term.length >= 4)
    )
  ];
  return limit ? terms.slice(0, limit) : terms;
};

export const rerankRetrievedChunks = (
  query: string,
  chunks: RetrievedChunk[]
): RetrievedChunk[] => {
  const queryTerms = normalizeTerms(query, 20);

  return chunks
    .map(chunk => {
      const contentTerms = new Set(normalizeTerms(chunk.content));
      const metadataText = `${chunk.metadata?.chapter || ""} ${
        chunk.metadata?.section || ""
      }`;
      const metadataTerms = new Set(normalizeTerms(metadataText));
      const lexicalMatches = queryTerms.filter(term =>
        contentTerms.has(term)
      ).length;
      const metadataMatches = queryTerms.filter(term =>
        metadataTerms.has(term)
      ).length;
      const divisor = Math.max(1, queryTerms.length);
      const lexicalScore = lexicalMatches / divisor;
      const metadataScore = metadataMatches / divisor;
      const finalScore = Math.min(
        1,
        chunk.similarity * 0.75 + lexicalScore * 0.2 + metadataScore * 0.05
      );

      return { ...chunk, similarity: finalScore };
    })
    .sort((a, b) => b.similarity - a.similarity);
};

const mergeRetrievedChunks = (
  chunks: RetrievedChunk[],
  limit: number
): RetrievedChunk[] => {
  const mergedById = new Map<number, RetrievedChunk>();

  chunks.forEach(chunk => {
    const existing = mergedById.get(chunk.id);
    if (!existing || chunk.similarity > existing.similarity) {
      mergedById.set(chunk.id, chunk);
    }
  });

  const mergedByContent = new Map<string, RetrievedChunk>();
  mergedById.forEach(chunk => {
    const sourceId =
      chunk.knowledgeAssetVersionId ||
      chunk.knowledgeDocumentId ||
      chunk.knowledgeAssetId ||
      "unknown";
    const normalizedContent = chunk.content
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const key = `${sourceId}:${normalizedContent}`;
    const existing = mergedByContent.get(key);
    if (!existing || chunk.similarity > existing.similarity) {
      mergedByContent.set(key, chunk);
    }
  });

  return [...mergedByContent.values()]
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
      kc."knowledgeAssetId",
      kc."knowledgeAssetVersionId",
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
        kc."knowledgeAssetId",
        kc."knowledgeAssetVersionId",
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

const fetchNeighborChunks = async (
  companyId: number,
  knowledgeBaseIds: number[],
  anchor: RetrievedChunk,
  window: number
): Promise<RetrievedChunk[]> => {
  const chunkIndex = Number(anchor.metadata?.chunkIndex);
  if (!Number.isInteger(chunkIndex) || window <= 0) {
    return [];
  }

  const mode: RetrievalPolicyMode = anchor.knowledgeAssetVersionId
    ? "cms"
    : "legacy";
  const policy = buildRetrievalSqlParts(mode);
  const identityCondition =
    mode === "cms"
      ? `kc."knowledgeAssetVersionId" = :sourceId`
      : `kc."knowledgeDocumentId" = :sourceId`;
  const sourceId =
    mode === "cms"
      ? anchor.knowledgeAssetVersionId
      : anchor.knowledgeDocumentId;

  if (!sourceId) {
    return [];
  }

  const [results] = await sequelize.query(
    `
    SELECT
      kc.id,
      kc.content,
      ${policy.selectDocumentId} AS "knowledgeDocumentId",
      kc."knowledgeAssetId",
      kc."knowledgeAssetVersionId",
      kc.metadata,
      GREATEST(
        0,
        :anchorSimilarity -
          ABS((kc.metadata->>'chunkIndex')::int - :chunkIndex) * 0.01
      ) AS similarity
    FROM "KnowledgeChunks" kc
    ${policy.joins}
    WHERE kc."companyId" = :companyId
      ${policy.where}
      AND ${identityCondition}
      AND kc.id <> :anchorId
      AND (kc.metadata->>'chunkIndex') ~ '^[0-9]+$'
      AND (kc.metadata->>'chunkIndex')::int
        BETWEEN :chunkIndex - :window AND :chunkIndex + :window
    ORDER BY (kc.metadata->>'chunkIndex')::int ASC
    LIMIT :neighborLimit
    `,
    {
      replacements: {
        companyId,
        knowledgeBaseIds,
        sourceId,
        anchorId: anchor.id,
        anchorSimilarity: anchor.similarity,
        chunkIndex,
        window,
        neighborLimit: window * 2
      }
    }
  );

  return (results as RetrievedChunk[]) || [];
};

export const expandRetrievedChunkNeighbors = async (
  companyId: number,
  knowledgeBaseIds: number[],
  anchors: RetrievedChunk[],
  window = getRagNeighborWindow()
): Promise<RetrievedChunk[]> => {
  if (!window || !anchors.length) {
    return anchors;
  }

  const neighbors = await Promise.all(
    anchors
      .slice(0, 3)
      .map(anchor =>
        fetchNeighborChunks(companyId, knowledgeBaseIds, anchor, window)
      )
  );
  return mergeRetrievedChunks(
    [...anchors, ...neighbors.flat()],
    anchors.length + 6
  );
};

export const postProcessRetrievedChunks = async ({
  companyId,
  knowledgeBaseIds,
  query,
  chunks,
  limit
}: {
  companyId: number;
  knowledgeBaseIds: number[];
  query: string;
  chunks: RetrievedChunk[];
  limit: number;
}): Promise<RetrievedChunk[]> => {
  const filtered = chunks.filter(
    chunk => chunk.similarity >= getRagMinimumSimilarity()
  );
  const reranked = rerankRetrievedChunks(query, filtered);
  const expanded = await expandRetrievedChunkNeighbors(
    companyId,
    knowledgeBaseIds,
    reranked.slice(0, limit)
  );
  return expanded.slice(0, limit);
};

export const retrieveKnowledgeForQuery = async (
  companyId: number,
  knowledgeBaseIds: number[],
  query: string,
  queryEmbedding: number[],
  limit = 5
): Promise<RetrievedChunk[]> => {
  const candidateLimit = Math.max(limit * 3, RAG_RETRIEVAL_CANDIDATE_LIMIT);
  const [vectorResults, keywordResults] = await Promise.all([
    searchKnowledgeChunks(
      companyId,
      knowledgeBaseIds,
      queryEmbedding,
      candidateLimit
    ),
    searchKnowledgeChunksByText(
      companyId,
      knowledgeBaseIds,
      query,
      candidateLimit
    )
  ]);

  const merged = new Map<number, RetrievedChunk>();

  [...vectorResults, ...keywordResults].forEach(chunk => {
    const existing = merged.get(chunk.id);
    if (!existing || chunk.similarity > existing.similarity) {
      merged.set(chunk.id, chunk);
    }
  });

  return postProcessRetrievedChunks({
    companyId,
    knowledgeBaseIds,
    query,
    chunks: [...merged.values()],
    limit
  });
};
