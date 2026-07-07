import sequelize from "../../database";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import StorageService from "../StorageService/StorageService";
import { createEmbedding } from "./ModelGateway";
import { splitTextIntoChunks } from "./ChunkingService";
import { extractTextFromBuffer } from "./DocumentParser";
import { logger } from "../../utils/logger";

const insertChunkWithEmbedding = async (
  companyId: number,
  knowledgeDocumentId: number,
  content: string,
  metadata: Record<string, unknown>,
  embedding: number[]
): Promise<void> => {
  const embeddingLiteral = `[${embedding.join(",")}]`;

  await sequelize.query(
    `
    INSERT INTO "KnowledgeChunks"
      ("companyId", "knowledgeDocumentId", content, metadata, embedding, "createdAt")
    VALUES
      (:companyId, :knowledgeDocumentId, :content, :metadata::jsonb, :embedding::vector, NOW())
    `,
    {
      replacements: {
        companyId,
        knowledgeDocumentId,
        content,
        metadata: JSON.stringify(metadata),
        embedding: embeddingLiteral
      }
    }
  );
};

export const ingestKnowledgeDocument = async (
  documentId: number,
  companyId: number,
  rawText?: string
): Promise<void> => {
  const document = await KnowledgeDocument.findOne({
    where: { id: documentId, companyId }
  });

  if (!document) {
    throw new Error("Document not found");
  }

  try {
    await document.update({ status: "processing" });

    let text = rawText || "";

    if (!text && document.storageUrl) {
      if (document.type === "text") {
        const key = document.storageUrl.replace(/^\/public\//, "");
        try {
          const buffer = await StorageService.download(key);
          text = buffer.toString("utf-8");
        } catch {
          text = document.storageUrl;
        }
      } else {
        const key = document.storageUrl.includes("://")
          ? document.storageUrl.split("/").slice(-3).join("/")
          : document.storageUrl.replace(/^\/public\//, "");
        const buffer = await StorageService.download(key);
        text = await extractTextFromBuffer(
          buffer,
          document.type,
          document.originalFilename
        );
      }
    }

    if (!text?.trim()) {
      throw new Error("No text extracted from document");
    }

    await KnowledgeChunk.destroy({
      where: { knowledgeDocumentId: document.id, companyId }
    });

    const chunks = splitTextIntoChunks(text);

    await Promise.all(
      chunks.map(async chunk => {
        const embedding = await createEmbedding(companyId, chunk.content);
        await insertChunkWithEmbedding(
          companyId,
          document.id,
          chunk.content,
          {
            ...chunk.metadata,
            documentTitle: document.title
          },
          embedding
        );
      })
    );

    await document.update({ status: "ready" });
  } catch (error) {
    logger.error({ error, documentId }, "Failed to ingest knowledge document");
    await document.update({ status: "error" });
    throw error;
  }
};
