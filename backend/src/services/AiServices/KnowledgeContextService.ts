import { Op } from "sequelize";
import sequelize from "../../database";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import KnowledgeBase from "../../models/KnowledgeBase";
import { createEmbedding } from "./ModelGateway";
import {
  retrieveKnowledgeForQuery,
  searchKnowledgeChunksByText,
  RetrievedChunk
} from "./RetrievalEngine";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { isKbCmsEnabledForCompany } from "./KnowledgeCms/AiKbCmsFeatureFlag";
import { logger } from "../../utils/logger";

const MAX_CONTEXT_CHARS = 20000;
const MAX_CHUNK_SNIPPET = 1200;
const FULL_CORPUS_DOC_LIMIT = 24;
const AUTO_FULL_CORPUS_DOC_LIMIT = 24;

export type KnowledgeContextResult = {
  contextBlock: string;
  usedChunks: {
    id: number;
    content: string;
    similarity: number;
    knowledgeDocumentId?: number;
    documentTitle?: string;
  }[];
  hasReadyDocuments: boolean;
  reingestedDocuments: number;
};

const mapChunks = (chunks: RetrievedChunk[]) =>
  chunks.map(chunk => ({
    id: chunk.id,
    content: chunk.content.slice(0, MAX_CHUNK_SNIPPET),
    similarity: chunk.similarity,
    knowledgeDocumentId: chunk.knowledgeDocumentId,
    documentTitle: String(chunk.metadata?.documentTitle || "")
  }));

const buildContextBlock = (
  chunks: { id: number; content: string; similarity: number }[]
): string =>
  chunks
    .map((chunk, idx) => `[Trecho ${idx + 1}]\n${chunk.content}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

const expandKnowledgeBaseIdsByDomain = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<number[]> => {
  if (!knowledgeBaseIds.length) {
    return knowledgeBaseIds;
  }

  const linkedBases = await KnowledgeBase.findAll({
    where: { companyId, id: { [Op.in]: knowledgeBaseIds } },
    attributes: ["id", "knowledgeDomainId"]
  });

  const domainIds = [
    ...new Set(
      linkedBases
        .map(base => base.knowledgeDomainId)
        .filter((id): id is number => Boolean(id))
    )
  ];

  if (!domainIds.length) {
    return knowledgeBaseIds;
  }

  const siblingBases = await KnowledgeBase.findAll({
    where: {
      companyId,
      active: true,
      knowledgeDomainId: { [Op.in]: domainIds }
    },
    attributes: ["id"],
    order: [["id", "ASC"]]
  });

  return [
    ...new Set([...knowledgeBaseIds, ...siblingBases.map(base => base.id)])
  ];
};

const loadAllReadyChunkTexts = async (
  companyId: number,
  knowledgeBaseIds: number[],
  chunkLimit = FULL_CORPUS_DOC_LIMIT
): Promise<
  {
    id: number;
    content: string;
    similarity: number;
    knowledgeDocumentId?: number;
    documentTitle?: string;
  }[]
> => {
  const cmsEnabled = await isKbCmsEnabledForCompany(companyId);

  if (cmsEnabled) {
    const [cmsRows] = await sequelize.query(
      `
      SELECT
        kc.id,
        kc.content,
        ka.title AS "documentTitle",
        kc."knowledgeDocumentId"
      FROM "KnowledgeChunks" kc
      INNER JOIN "KnowledgeAssets" ka ON ka.id = kc."knowledgeAssetId"
      WHERE kc."companyId" = :companyId
        AND kc."knowledgeBaseId" IN (:knowledgeBaseIds)
        AND kc."lifecycleStatus" = 'published'
        AND ka."lifecycleStatus" = 'published'
        AND ka."publishedVersionId" = kc."knowledgeAssetVersionId"
      ORDER BY kc.id ASC
      LIMIT :chunkLimit
      `,
      {
        replacements: { companyId, knowledgeBaseIds, chunkLimit }
      }
    );

    const cmsChunks = (
      cmsRows as {
        id: number;
        content: string;
        documentTitle?: string;
        knowledgeDocumentId?: number;
      }[]
    ).map(row => ({
      id: row.id,
      content: row.content.slice(0, MAX_CHUNK_SNIPPET),
      similarity: 0.4,
      knowledgeDocumentId: row.knowledgeDocumentId,
      documentTitle: row.documentTitle || ""
    }));

    if (cmsChunks.length) {
      return cmsChunks;
    }
  }

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
    limit: chunkLimit
  });

  return rows.map(row => ({
    id: row.id,
    content: row.content.slice(0, MAX_CHUNK_SNIPPET),
    similarity: 0.4,
    knowledgeDocumentId: row.knowledgeDocumentId,
    documentTitle:
      (row as KnowledgeChunk & { KnowledgeDocument?: KnowledgeDocument })
        .KnowledgeDocument?.title || ""
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
  provider,
  loadStrategy = "auto"
}: {
  companyId: number;
  knowledgeBaseIds: number[];
  userText: string;
  provider?: string;
  loadStrategy?: "auto" | "full";
}): Promise<KnowledgeContextResult> => {
  const expandedKnowledgeBaseIds = await expandKnowledgeBaseIdsByDomain(
    companyId,
    knowledgeBaseIds
  );

  if (!expandedKnowledgeBaseIds.length) {
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
      knowledgeBaseId: { [Op.in]: expandedKnowledgeBaseIds },
      status: "ready"
    }
  });

  const cmsEnabled = await isKbCmsEnabledForCompany(companyId);
  let cmsPublishedChunkCount = 0;

  if (cmsEnabled) {
    const [cmsCountRows] = await sequelize.query(
      `
      SELECT COUNT(*)::int AS count
      FROM "KnowledgeChunks" kc
      INNER JOIN "KnowledgeAssets" ka ON ka.id = kc."knowledgeAssetId"
      WHERE kc."companyId" = :companyId
        AND kc."knowledgeBaseId" IN (:knowledgeBaseIds)
        AND kc."lifecycleStatus" = 'published'
        AND ka."lifecycleStatus" = 'published'
      `,
      {
        replacements: { companyId, knowledgeBaseIds: expandedKnowledgeBaseIds }
      }
    );
    cmsPublishedChunkCount =
      (cmsCountRows as { count: number }[])[0]?.count || 0;
  }

  const effectiveReadyCount = readyCount + cmsPublishedChunkCount;

  let reingestedDocuments = 0;

  if (effectiveReadyCount === 0) {
    reingestedDocuments = await reingestPendingDocuments(
      companyId,
      expandedKnowledgeBaseIds
    );
  }

  if (
    loadStrategy === "full" ||
    (effectiveReadyCount > 0 &&
      effectiveReadyCount <= AUTO_FULL_CORPUS_DOC_LIMIT)
  ) {
    const usedChunks = await loadAllReadyChunkTexts(
      companyId,
      expandedKnowledgeBaseIds,
      loadStrategy === "full" ? 48 : FULL_CORPUS_DOC_LIMIT
    );
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
      expandedKnowledgeBaseIds,
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
      expandedKnowledgeBaseIds,
      userText,
      8
    );
  }

  if (!merged.length && userText.trim().length >= 3) {
    merged = await searchKnowledgeChunksByText(
      companyId,
      expandedKnowledgeBaseIds,
      userText,
      8
    );
  }

  let usedChunks: KnowledgeContextResult["usedChunks"] = mapChunks(merged);

  if (!usedChunks.length) {
    usedChunks = await loadAllReadyChunkTexts(
      companyId,
      expandedKnowledgeBaseIds
    );
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
