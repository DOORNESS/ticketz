import crypto from "crypto";
import { Op } from "sequelize";
import sequelize from "../../../database";
import KnowledgeAsset from "../../../models/KnowledgeAsset";
import KnowledgeAssetVersion from "../../../models/KnowledgeAssetVersion";
import KnowledgeBase from "../../../models/KnowledgeBase";
import KnowledgeChunk from "../../../models/KnowledgeChunk";
import { createEmbedding } from "../ModelGateway";
import { splitTextIntoChunks, StructuredPage } from "../ChunkingService";
import { logger } from "../../../utils/logger";
import { getAssetIngestionHandler } from "./ingestion/AssetIngestionRegistry";
import { RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE } from "../RagConfig";

const insertChunkWithEmbedding = async (input: {
  companyId: number;
  knowledgeDocumentId?: number | null;
  knowledgeAssetVersionId: number;
  knowledgeAssetId: number;
  knowledgeBaseId: number;
  knowledgeDomainId?: number | null;
  categoryId?: number | null;
  lifecycleStatus: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}): Promise<void> => {
  const embeddingLiteral = `[${input.embedding.join(",")}]`;

  await sequelize.query(
    `
    INSERT INTO "KnowledgeChunks"
      ("companyId", "knowledgeDocumentId", "knowledgeAssetVersionId", "knowledgeAssetId",
       "knowledgeBaseId", "knowledgeDomainId", "categoryId", "lifecycleStatus",
       content, metadata, embedding, "createdAt")
    VALUES
      (:companyId, :knowledgeDocumentId, :knowledgeAssetVersionId, :knowledgeAssetId,
       :knowledgeBaseId, :knowledgeDomainId, :categoryId, :lifecycleStatus,
       :content, :metadata::jsonb, :embedding::vector, NOW())
    `,
    {
      replacements: {
        companyId: input.companyId,
        knowledgeDocumentId: input.knowledgeDocumentId ?? null,
        knowledgeAssetVersionId: input.knowledgeAssetVersionId,
        knowledgeAssetId: input.knowledgeAssetId,
        knowledgeBaseId: input.knowledgeBaseId,
        knowledgeDomainId: input.knowledgeDomainId ?? null,
        categoryId: input.categoryId ?? null,
        lifecycleStatus: input.lifecycleStatus,
        content: input.content,
        metadata: JSON.stringify(input.metadata),
        embedding: embeddingLiteral
      }
    }
  );
};

export const ingestKnowledgeAssetVersion = async (
  companyId: number,
  assetVersionId: number,
  rawText?: string
): Promise<KnowledgeAssetVersion> => {
  const version = await KnowledgeAssetVersion.findOne({
    where: { id: assetVersionId, companyId }
  });

  if (!version) {
    throw new Error("Asset version not found");
  }

  if (["indexed", "processing"].includes(version.ingestionStatus)) {
    return version;
  }

  const asset = await KnowledgeAsset.findOne({
    where: { id: version.knowledgeAssetId, companyId }
  });

  if (!asset) {
    throw new Error("Asset not found");
  }

  const base = await KnowledgeBase.findOne({
    where: { id: asset.knowledgeBaseId, companyId }
  });

  const [claimed] = await KnowledgeAssetVersion.update(
    { ingestionStatus: "processing", errorMessage: null },
    {
      where: {
        id: version.id,
        companyId,
        ingestionStatus: { [Op.notIn]: ["indexed", "processing"] }
      }
    }
  );

  if (!claimed) {
    return (
      (await KnowledgeAssetVersion.findOne({
        where: { id: version.id, companyId }
      })) || version
    );
  }

  try {
    const handler = getAssetIngestionHandler(asset.assetType);
    const extracted = await handler.extract({
      companyId,
      storageUrl: version.storageUrl,
      rawText,
      metadata: asset.metadata
    });

    const text = extracted.text?.trim();
    if (!text && asset.assetType !== "faq") {
      throw new Error("No text extracted from asset version");
    }

    await KnowledgeChunk.destroy({
      where: { companyId, knowledgeAssetVersionId: version.id }
    });

    const extractedMetadata = { ...(extracted.metadata || {}) };
    const structuredPages = Array.isArray(extractedMetadata.structuredPages)
      ? (extractedMetadata.structuredPages as StructuredPage[])
      : undefined;
    delete extractedMetadata.structuredPages;
    const format = String(extractedMetadata.format || asset.assetType);
    const chunks = text
      ? splitTextIntoChunks(text, { pages: structuredPages, format })
      : [];
    const contentHash = crypto
      .createHash("sha256")
      .update(text || "")
      .digest("hex");

    await Promise.all(
      chunks.map(async chunk => {
        const embedding = await createEmbedding(companyId, chunk.content);
        await insertChunkWithEmbedding({
          companyId,
          knowledgeDocumentId: asset.legacyDocumentId,
          knowledgeAssetVersionId: version.id,
          knowledgeAssetId: asset.id,
          knowledgeBaseId: asset.knowledgeBaseId,
          knowledgeDomainId: base?.knowledgeDomainId || null,
          categoryId: asset.categoryId,
          lifecycleStatus: "draft",
          content: chunk.content,
          metadata: {
            ...chunk.metadata,
            assetTitle: asset.title,
            ...extractedMetadata
          },
          embedding
        });
      })
    );

    await version.update({
      ingestionStatus: "indexed",
      chunkCount: chunks.length,
      chunkSize: RAG_CHUNK_SIZE,
      chunkOverlap: RAG_CHUNK_OVERLAP,
      ingestionPipeline: "structured-v2",
      tokenEstimate: Math.ceil((text || "").length / 4),
      contentHash,
      rawTextPreview: (text || "").slice(0, 500),
      errorMessage: null
    });

    return version;
  } catch (error) {
    logger.error(
      { error, assetVersionId, companyId },
      "Failed to ingest knowledge asset version"
    );
    await version.update({
      ingestionStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "ingestion_failed"
    });
    throw error;
  }
};
