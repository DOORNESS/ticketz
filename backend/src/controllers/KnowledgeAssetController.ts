import { Request, Response } from "express";
import AppError from "../errors/AppError";
import StorageService from "../services/StorageService/StorageService";
import {
  approveKnowledgeAsset,
  archiveKnowledgeAsset,
  cloneKnowledgeAssetToBase,
  createKnowledgeAsset,
  createNewAssetVersionFromCurrent,
  getKnowledgeAsset,
  listAssetIngestionJobs,
  listKnowledgeAssets,
  promoteAndPublishKnowledgeAsset,
  submitAssetForReview,
  updateKnowledgeAsset
} from "../services/AiServices/KnowledgeCms/KnowledgeAssetCmsService";
import { listAssetVersions } from "../services/AiServices/KnowledgeCms/KnowledgeAssetVersionService";
import { publishKnowledgeAsset } from "../services/AiServices/KnowledgeCms/KnowledgePublishService";
import { rollbackToVersion } from "../services/AiServices/KnowledgeCms/KnowledgeAtomicSwapService";
import { enqueueAssetReindex } from "../services/AiServices/KnowledgeCms/KnowledgeReindexService";
import { enqueueIndexAssetVersion } from "../services/AiServices/KnowledgeCms/AiKnowledgeIngestionQueueService";
import {
  assertKnowledgePermission,
  checkKnowledgePermission
} from "../services/AiServices/KnowledgeCms/KnowledgePermissionService";
import { KnowledgeAssetType } from "../models/KnowledgeAsset";
import { safeAiQuery } from "../helpers/safeAiQuery";

const currentUserId = (req: Request): number | undefined => {
  const parsed = Number(req.user.id);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const allowed = await checkKnowledgePermission(
    "read",
    { companyId, resourceType: "asset" },
    { id: Number(id), profile, companyId }
  );
  if (!allowed) {
    throw new AppError("ERR_KNOWLEDGE_PERMISSION_DENIED", 403);
  }

  const assets = await safeAiQuery(
    () =>
      listKnowledgeAssets({
        companyId,
        knowledgeBaseId: req.query.knowledgeBaseId
          ? Number(req.query.knowledgeBaseId)
          : undefined,
        categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
        lifecycleStatus: req.query.lifecycleStatus as
          | import("../models/KnowledgeAsset").KnowledgeLifecycleStatus
          | undefined
      }),
    []
  );

  return res.json(assets);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "read",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await getKnowledgeAsset(companyId, Number(assetId));
  return res.json(asset);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id, profile } = req.user;

  await assertKnowledgePermission(
    "write",
    {
      companyId,
      resourceType: "base",
      resourceId: Number(req.body.knowledgeBaseId)
    },
    { id: Number(id), profile, companyId }
  );

  const asset = await createKnowledgeAsset({
    companyId,
    authorUserId: currentUserId(req),
    ...req.body
  });

  return res.status(201).json(asset);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await updateKnowledgeAsset({
    companyId,
    assetId: Number(assetId),
    ...req.body
  });

  return res.json(asset);
};

const parseAutoPublish = (value: unknown): boolean =>
  value === true || value === "true" || value === "1";

const maybeAutoPublish = async (
  companyId: number,
  assetId: number,
  autoPublish: boolean,
  userId?: number
): Promise<void> => {
  if (!autoPublish) {
    return;
  }

  await promoteAndPublishKnowledgeAsset(companyId, assetId, userId);
};

export const storeText = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { knowledgeBaseId, categoryId, title, content, autoPublish } = req.body;

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "base", resourceId: Number(knowledgeBaseId) },
    { id: Number(id), profile, companyId }
  );

  await StorageService.ensureReady(companyId);
  const upload = await StorageService.uploadBuffer(
    Buffer.from(content, "utf-8"),
    {
      companyId,
      filename: `${title || "manual"}.txt`,
      contentType: "text/plain",
      folder: "knowledge/text"
    }
  );

  const asset = await createKnowledgeAsset({
    companyId,
    knowledgeBaseId: Number(knowledgeBaseId),
    categoryId: categoryId ? Number(categoryId) : undefined,
    assetType: "text",
    title,
    storageUrl: upload.key,
    rawText: content,
    authorUserId: currentUserId(req)
  });

  if (asset.currentVersionId) {
    await enqueueIndexAssetVersion({
      companyId,
      assetVersionId: asset.currentVersionId,
      rawText: content
    });
  }

  await maybeAutoPublish(
    companyId,
    asset.id,
    parseAutoPublish(autoPublish),
    currentUserId(req)
  );

  return res.status(201).json(await getKnowledgeAsset(companyId, asset.id));
};

export const storeUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { knowledgeBaseId, categoryId, title, autoPublish } = req.body;
  const file = req.file;

  if (!file) {
    throw new AppError("File is required", 400);
  }

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "base", resourceId: Number(knowledgeBaseId) },
    { id: Number(id), profile, companyId }
  );

  const ext = file.originalname.split(".").pop()?.toLowerCase() || "bin";
  const allowed = ["pdf", "docx", "txt", "md", "markdown", "html"];
  if (!allowed.includes(ext)) {
    throw new AppError("Unsupported file type", 400);
  }

  const assetTypeMap: Record<string, KnowledgeAssetType> = {
    pdf: "pdf",
    docx: "word",
    txt: "text",
    md: "markdown",
    markdown: "markdown",
    html: "markdown"
  };

  await StorageService.ensureReady(companyId);
  const upload = await StorageService.uploadBuffer(file.buffer, {
    companyId,
    filename: file.originalname,
    contentType: file.mimetype,
    folder: "knowledge/documents"
  });

  const asset = await createKnowledgeAsset({
    companyId,
    knowledgeBaseId: Number(knowledgeBaseId),
    categoryId: categoryId ? Number(categoryId) : undefined,
    assetType: assetTypeMap[ext] || "text",
    title: title || file.originalname,
    storageUrl: upload.key,
    authorUserId: currentUserId(req)
  });

  if (asset.currentVersionId) {
    await enqueueIndexAssetVersion({
      companyId,
      assetVersionId: asset.currentVersionId
    });
  }

  await maybeAutoPublish(
    companyId,
    asset.id,
    parseAutoPublish(autoPublish),
    currentUserId(req)
  );

  return res.status(201).json(await getKnowledgeAsset(companyId, asset.id));
};

export const storeUrl = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { knowledgeBaseId, categoryId, title, url, autoPublish } = req.body;

  if (!url || typeof url !== "string") {
    throw new AppError("url is required", 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    throw new AppError("Invalid URL", 400);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new AppError("Only http/https URLs are supported", 400);
  }

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "base", resourceId: Number(knowledgeBaseId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await createKnowledgeAsset({
    companyId,
    knowledgeBaseId: Number(knowledgeBaseId),
    categoryId: categoryId ? Number(categoryId) : undefined,
    assetType: "url",
    title: title || parsedUrl.hostname,
    storageUrl: parsedUrl.toString(),
    metadata: { url: parsedUrl.toString(), sourceType: "website" },
    authorUserId: currentUserId(req)
  });

  if (asset.currentVersionId) {
    await enqueueIndexAssetVersion({
      companyId,
      assetVersionId: asset.currentVersionId
    });
  }

  await maybeAutoPublish(
    companyId,
    asset.id,
    parseAutoPublish(autoPublish),
    currentUserId(req)
  );

  return res.status(201).json(await getKnowledgeAsset(companyId, asset.id));
};

export const cloneToBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;
  const { targetKnowledgeBaseId, categoryId, autoPublish } = req.body;

  if (!targetKnowledgeBaseId) {
    throw new AppError("targetKnowledgeBaseId is required", 400);
  }

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  await assertKnowledgePermission(
    "write",
    {
      companyId,
      resourceType: "base",
      resourceId: Number(targetKnowledgeBaseId)
    },
    { id: Number(id), profile, companyId }
  );

  const asset = await cloneKnowledgeAssetToBase({
    companyId,
    assetId: Number(assetId),
    targetKnowledgeBaseId: Number(targetKnowledgeBaseId),
    categoryId: categoryId ? Number(categoryId) : undefined,
    authorUserId: currentUserId(req),
    autoPublish: parseAutoPublish(autoPublish)
  });

  return res.status(201).json(asset);
};

export const quickPublish = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "publish",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await promoteAndPublishKnowledgeAsset(
    companyId,
    Number(assetId),
    currentUserId(req)
  );

  return res.json(asset);
};

export const listVersions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "read",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const versions = await listAssetVersions(companyId, Number(assetId));
  return res.json(versions);
};

export const storeVersion = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const version = await createNewAssetVersionFromCurrent(
    companyId,
    Number(assetId),
    currentUserId(req),
    req.body.changeSummary
  );

  if (req.body.storageUrl) {
    await version.update({ storageUrl: req.body.storageUrl });
  }

  await enqueueIndexAssetVersion({
    companyId,
    assetVersionId: version.id,
    rawText: req.body.rawText
  });

  return res.status(201).json(version);
};

export const submitReview = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "write",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await submitAssetForReview(companyId, Number(assetId));
  return res.json(asset);
};

export const approve = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "publish",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await approveKnowledgeAsset(companyId, Number(assetId));
  return res.json(asset);
};

export const publish = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "publish",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await publishKnowledgeAsset({
    companyId,
    assetId: Number(assetId),
    userId: currentUserId(req),
    versionId: req.body.versionId ? Number(req.body.versionId) : undefined
  });

  return res.json(asset);
};

export const archive = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "publish",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await archiveKnowledgeAsset(companyId, Number(assetId));
  return res.json(asset);
};

export const rollback = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;
  const { versionId } = req.body;

  if (!versionId) {
    throw new AppError("versionId is required", 400);
  }

  await assertKnowledgePermission(
    "publish",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await rollbackToVersion({
    companyId,
    assetId: Number(assetId),
    targetVersionId: Number(versionId),
    publishedByUserId: currentUserId(req)
  });

  return res.json(asset);
};

export const reindex = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "publish",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const asset = await enqueueAssetReindex({
    companyId,
    assetId: Number(assetId),
    userId: currentUserId(req)
  });

  return res.json(asset);
};

export const ingestionJobs = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id, profile } = req.user;
  const { assetId } = req.params;

  await assertKnowledgePermission(
    "read",
    { companyId, resourceType: "asset", resourceId: Number(assetId) },
    { id: Number(id), profile, companyId }
  );

  const jobs = await listAssetIngestionJobs(companyId, Number(assetId));
  return res.json(jobs);
};
