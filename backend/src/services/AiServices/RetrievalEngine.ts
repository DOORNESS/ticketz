import sequelize from "../../database";

export type RetrievedChunk = {
  id: number;
  content: string;
  knowledgeDocumentId: number;
  metadata: Record<string, unknown>;
  similarity: number;
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

  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const [results] = await sequelize.query(
    `
    SELECT
      kc.id,
      kc.content,
      kc."knowledgeDocumentId",
      kc.metadata,
      1 - (kc.embedding <=> :embedding::vector) AS similarity
    FROM "KnowledgeChunks" kc
    INNER JOIN "KnowledgeDocuments" kd ON kd.id = kc."knowledgeDocumentId"
    WHERE kc."companyId" = :companyId
      AND kd."knowledgeBaseId" IN (:knowledgeBaseIds)
      AND kd.status = 'ready'
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
