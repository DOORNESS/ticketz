import { Request, Response } from "express";
import KnowledgeDocument from "../models/KnowledgeDocument";
import KnowledgeChunk from "../models/KnowledgeChunk";
import KnowledgeBase from "../models/KnowledgeBase";
import StorageService from "../services/StorageService/StorageService";
import { ingestKnowledgeDocument } from "../services/AiServices/IngestKnowledgeDocumentService";
import AppError from "../errors/AppError";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { knowledgeBaseId } = req.query;

  const where: { companyId: number; knowledgeBaseId?: number } = { companyId };
  if (knowledgeBaseId) {
    where.knowledgeBaseId = Number(knowledgeBaseId);
  }

  const documents = await KnowledgeDocument.findAll({
    where,
    order: [["createdAt", "DESC"]]
  });

  return res.json(documents);
};

export const storeText = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { knowledgeBaseId, title, content } = req.body;

  const base = await KnowledgeBase.findOne({
    where: { id: knowledgeBaseId, companyId }
  });

  if (!base) {
    throw new AppError("Knowledge base not found", 404);
  }

  const upload = await StorageService.uploadBuffer(
    Buffer.from(content, "utf-8"),
    {
      companyId,
      filename: `${title || "manual"}.txt`,
      contentType: "text/plain",
      folder: "knowledge/text"
    }
  );

  const document = await KnowledgeDocument.create({
    companyId,
    knowledgeBaseId,
    title,
    type: "text",
    originalFilename: `${title}.txt`,
    storageUrl: upload.key,
    status: "pending"
  });

  ingestKnowledgeDocument(document.id, companyId, content).catch(() => null);

  return res.status(201).json(document);
};

export const storeFile = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { knowledgeBaseId, title } = req.body;
  const file = req.file;

  if (!file) {
    throw new AppError("File is required", 400);
  }

  const base = await KnowledgeBase.findOne({
    where: { id: knowledgeBaseId, companyId }
  });

  if (!base) {
    throw new AppError("Knowledge base not found", 404);
  }

  const ext = file.originalname.split(".").pop()?.toLowerCase() || "bin";
  const allowed = ["pdf", "docx", "txt", "md", "markdown", "html"];
  if (!allowed.includes(ext)) {
    throw new AppError("Unsupported file type", 400);
  }

  const upload = await StorageService.uploadBuffer(file.buffer, {
    companyId,
    filename: file.originalname,
    contentType: file.mimetype,
    folder: "knowledge/documents"
  });

  const document = await KnowledgeDocument.create({
    companyId,
    knowledgeBaseId,
    title: title || file.originalname,
    type: ext,
    originalFilename: file.originalname,
    storageUrl: upload.key,
    status: "pending"
  });

  ingestKnowledgeDocument(document.id, companyId).catch(() => null);

  return res.status(201).json(document);
};

export const reprocess = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { documentId } = req.params;

  const document = await KnowledgeDocument.findOne({
    where: { id: documentId, companyId }
  });

  if (!document) {
    throw new AppError("Document not found", 404);
  }

  await ingestKnowledgeDocument(document.id, companyId);
  await document.reload();
  return res.json(document);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { documentId } = req.params;

  const document = await KnowledgeDocument.findOne({
    where: { id: documentId, companyId }
  });

  if (!document) {
    throw new AppError("Document not found", 404);
  }

  await KnowledgeChunk.destroy({
    where: { knowledgeDocumentId: document.id, companyId }
  });

  if (document.storageUrl) {
    try {
      await StorageService.delete(document.storageUrl);
    } catch {
      // ignore storage delete errors
    }
  }

  await document.destroy();
  return res.status(200).json({ message: "Document deleted" });
};
