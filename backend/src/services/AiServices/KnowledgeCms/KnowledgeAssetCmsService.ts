import crypto from "crypto";
import { Op } from "sequelize";
import KnowledgeAsset, {
  KnowledgeAssetType,
  KnowledgeLifecycleStatus
} from "../../../models/KnowledgeAsset";
import KnowledgeAssetVersion from "../../../models/KnowledgeAssetVersion";
import KnowledgeBase from "../../../models/KnowledgeBase";
import KnowledgeCategory from "../../../models/KnowledgeCategory";
import KnowledgeIngestionJob from "../../../models/KnowledgeIngestionJob";
import KnowledgeChunk from "../../../models/KnowledgeChunk";
import AppError from "../../../errors/AppError";
import { validateKnowledgeMetadata } from "./KnowledgeMetadataSchema";
import { slugify } from "./slugify";
import { isKbCmsEnabledForCompany } from "./AiKbCmsFeatureFlag";
import {
  createAssetVersion,
  getNextVersionNumber
} from "./KnowledgeAssetVersionService";
import { enqueueIndexAssetVersion } from "./AiKnowledgeIngestionQueueService";
import { publishKnowledgeAsset } from "./KnowledgePublishService";

export type ListAssetsFilter = {
  companyId: number;
  knowledgeBaseId?: number;
  categoryId?: number;
  lifecycleStatus?: KnowledgeLifecycleStatus;
  assetType?: KnowledgeAssetType;
};

export const listKnowledgeAssets = async (
  filter: ListAssetsFilter
): Promise<KnowledgeAsset[]> => {
  const where: Record<string, unknown> = { companyId: filter.companyId };

  if (filter.knowledgeBaseId) {
    where.knowledgeBaseId = filter.knowledgeBaseId;
  }
  if (filter.categoryId) {
    where.categoryId = filter.categoryId;
  }
  if (filter.lifecycleStatus) {
    where.lifecycleStatus = filter.lifecycleStatus;
  }
  if (filter.assetType) {
    where.assetType = filter.assetType;
  }

  return KnowledgeAsset.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    include: [
      { model: KnowledgeAssetVersion, as: "publishedVersion" },
      { model: KnowledgeAssetVersion, as: "currentVersion" }
    ]
  });
};

export const getKnowledgeAsset = async (
  companyId: number,
  assetId: number
): Promise<KnowledgeAsset> => {
  const asset = await KnowledgeAsset.findOne({
    where: { id: assetId, companyId },
    include: [
      { model: KnowledgeAssetVersion, as: "publishedVersion" },
      { model: KnowledgeAssetVersion, as: "currentVersion" }
    ]
  });

  if (!asset) {
    throw new AppError("Knowledge asset not found", 404);
  }

  return asset;
};

export type CreateAssetInput = {
  companyId: number;
  knowledgeBaseId: number;
  categoryId?: number;
  assetType: KnowledgeAssetType;
  title: string;
  slug?: string;
  summary?: string;
  authorUserId?: number;
  metadata?: Record<string, unknown>;
  storageUrl?: string;
  rawText?: string;
  legacyDocumentId?: number;
};

const ensureCategoryForCms = async (
  companyId: number,
  knowledgeBaseId: number,
  categoryId?: number
): Promise<number | null> => {
  const cmsEnabled = await isKbCmsEnabledForCompany(companyId);
  if (!cmsEnabled) {
    return categoryId || null;
  }

  if (!categoryId) {
    throw new AppError("categoryId is required when CMS is enabled", 400);
  }

  const category = await KnowledgeCategory.findOne({
    where: { id: categoryId, companyId, knowledgeBaseId }
  });

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  return categoryId;
};

export const createKnowledgeAsset = async (
  input: CreateAssetInput
): Promise<KnowledgeAsset> => {
  const base = await KnowledgeBase.findOne({
    where: { id: input.knowledgeBaseId, companyId: input.companyId }
  });

  if (!base) {
    throw new AppError("Knowledge base not found", 404);
  }

  const categoryId = await ensureCategoryForCms(
    input.companyId,
    input.knowledgeBaseId,
    input.categoryId
  );

  const slug = slugify(input.slug || `${input.title}-${Date.now()}`);
  const conflict = await KnowledgeAsset.findOne({
    where: {
      companyId: input.companyId,
      knowledgeBaseId: input.knowledgeBaseId,
      slug
    }
  });

  if (conflict) {
    throw new AppError("Asset slug already exists in this base", 409);
  }

  const asset = await KnowledgeAsset.create({
    companyId: input.companyId,
    knowledgeBaseId: input.knowledgeBaseId,
    categoryId,
    assetType: input.assetType,
    lifecycleStatus: "draft",
    title: input.title,
    slug,
    summary: input.summary || "",
    authorUserId: input.authorUserId || null,
    metadata: validateKnowledgeMetadata(input.metadata),
    legacyDocumentId: input.legacyDocumentId || null
  });

  const version = await createAssetVersion({
    companyId: input.companyId,
    knowledgeAssetId: asset.id,
    title: input.title,
    storageUrl: input.storageUrl || "",
    rawTextPreview: input.rawText?.slice(0, 500) || "",
    createdByUserId: input.authorUserId,
    contentHash: input.rawText
      ? crypto.createHash("sha256").update(input.rawText).digest("hex")
      : undefined
  });

  await asset.update({ currentVersionId: version.id });

  if (input.storageUrl || input.rawText) {
    await enqueueIndexAssetVersion({
      companyId: input.companyId,
      assetVersionId: version.id,
      autoPublish: false
    });
  }

  return getKnowledgeAsset(input.companyId, asset.id);
};

export type UpdateAssetInput = {
  companyId: number;
  assetId: number;
  title?: string;
  slug?: string;
  summary?: string;
  categoryId?: number;
  metadata?: Record<string, unknown>;
};

export const updateKnowledgeAsset = async (
  input: UpdateAssetInput
): Promise<KnowledgeAsset> => {
  const asset = await getKnowledgeAsset(input.companyId, input.assetId);

  if (asset.lifecycleStatus === "published") {
    throw new AppError("Published assets must use versioning", 409);
  }

  const nextSlug = input.slug ? slugify(input.slug) : undefined;
  if (nextSlug && nextSlug !== asset.slug) {
    const conflict = await KnowledgeAsset.findOne({
      where: {
        companyId: input.companyId,
        knowledgeBaseId: asset.knowledgeBaseId,
        slug: nextSlug,
        id: { [Op.ne]: asset.id }
      }
    });
    if (conflict) {
      throw new AppError("Asset slug already exists in this base", 409);
    }
  }

  if (input.categoryId != null) {
    const category = await KnowledgeCategory.findOne({
      where: {
        id: input.categoryId,
        companyId: input.companyId,
        knowledgeBaseId: asset.knowledgeBaseId
      }
    });
    if (!category) {
      throw new AppError("Category not found", 404);
    }
  }

  await asset.update({
    ...(input.title != null ? { title: input.title } : {}),
    ...(nextSlug ? { slug: nextSlug } : {}),
    ...(input.summary != null ? { summary: input.summary } : {}),
    ...(input.categoryId != null ? { categoryId: input.categoryId } : {}),
    ...(input.metadata != null
      ? { metadata: validateKnowledgeMetadata(input.metadata) }
      : {})
  });

  return getKnowledgeAsset(input.companyId, asset.id);
};

const assertTransition = (
  current: KnowledgeLifecycleStatus,
  allowed: KnowledgeLifecycleStatus[]
): void => {
  if (!allowed.includes(current)) {
    throw new AppError(`Invalid lifecycle transition from ${current}`, 409);
  }
};

export const submitAssetForReview = async (
  companyId: number,
  assetId: number
): Promise<KnowledgeAsset> => {
  const asset = await getKnowledgeAsset(companyId, assetId);
  assertTransition(asset.lifecycleStatus, ["draft"]);
  await asset.update({ lifecycleStatus: "review" });
  return getKnowledgeAsset(companyId, assetId);
};

export const approveKnowledgeAsset = async (
  companyId: number,
  assetId: number
): Promise<KnowledgeAsset> => {
  const asset = await getKnowledgeAsset(companyId, assetId);
  assertTransition(asset.lifecycleStatus, ["review"]);
  await asset.update({ lifecycleStatus: "approved" });
  return getKnowledgeAsset(companyId, assetId);
};

export const rejectKnowledgeAssetReview = async (
  companyId: number,
  assetId: number
): Promise<KnowledgeAsset> => {
  const asset = await getKnowledgeAsset(companyId, assetId);
  assertTransition(asset.lifecycleStatus, ["review"]);
  await asset.update({ lifecycleStatus: "draft" });
  return getKnowledgeAsset(companyId, assetId);
};

export const archiveKnowledgeAsset = async (
  companyId: number,
  assetId: number
): Promise<KnowledgeAsset> => {
  const asset = await getKnowledgeAsset(companyId, assetId);
  assertTransition(asset.lifecycleStatus, ["published", "approved", "draft"]);
  await asset.update({
    lifecycleStatus: "archived",
    archivedAt: new Date(),
    publishedVersionId: null
  });

  await KnowledgeChunk.update(
    { lifecycleStatus: "archived" },
    { where: { companyId, knowledgeAssetId: asset.id } }
  );

  return getKnowledgeAsset(companyId, assetId);
};

export const listAssetIngestionJobs = async (
  companyId: number,
  assetId: number
): Promise<KnowledgeIngestionJob[]> => {
  await getKnowledgeAsset(companyId, assetId);
  return KnowledgeIngestionJob.findAll({
    where: { companyId, knowledgeAssetId: assetId },
    order: [["createdAt", "DESC"]],
    limit: 50
  });
};

export const createNewAssetVersionFromCurrent = async (
  companyId: number,
  assetId: number,
  userId?: number,
  changeSummary?: string
): Promise<KnowledgeAssetVersion> => {
  const asset = await getKnowledgeAsset(companyId, assetId);
  const current = asset.currentVersionId
    ? await KnowledgeAssetVersion.findOne({
        where: { id: asset.currentVersionId, companyId }
      })
    : null;

  const versionNumber = await getNextVersionNumber(companyId, assetId);

  const version = await createAssetVersion({
    companyId,
    knowledgeAssetId: assetId,
    versionNumber,
    title: asset.title,
    storageUrl: current?.storageUrl || "",
    rawTextPreview: current?.rawTextPreview || "",
    changeSummary: changeSummary || "",
    createdByUserId: userId,
    contentHash: current?.contentHash,
    chunkSize: current?.chunkSize,
    chunkOverlap: current?.chunkOverlap,
    embeddingModel: current?.embeddingModel,
    embeddingProvider: current?.embeddingProvider
  });

  await asset.update({ currentVersionId: version.id });
  return version;
};

export const promoteAndPublishKnowledgeAsset = async (
  companyId: number,
  assetId: number,
  userId?: number
): Promise<KnowledgeAsset> => {
  let asset = await getKnowledgeAsset(companyId, assetId);

  if (asset.lifecycleStatus === "draft") {
    asset = await submitAssetForReview(companyId, assetId);
  }
  if (asset.lifecycleStatus === "review") {
    asset = await approveKnowledgeAsset(companyId, assetId);
  }

  return publishKnowledgeAsset({
    companyId,
    assetId,
    userId
  });
};

export const cloneKnowledgeAssetToBase = async (input: {
  companyId: number;
  assetId: number;
  targetKnowledgeBaseId: number;
  categoryId?: number;
  authorUserId?: number;
  autoPublish?: boolean;
}): Promise<KnowledgeAsset> => {
  const source = await getKnowledgeAsset(input.companyId, input.assetId);
  const version = source.currentVersion;

  if (!version) {
    throw new AppError("Asset has no version to clone", 409);
  }

  const targetBase = await KnowledgeBase.findOne({
    where: { id: input.targetKnowledgeBaseId, companyId: input.companyId }
  });

  if (!targetBase) {
    throw new AppError("Target knowledge base not found", 404);
  }

  let categoryId = input.categoryId;
  if (!categoryId && source.categoryId) {
    const fallback = await KnowledgeCategory.findOne({
      where: {
        companyId: input.companyId,
        knowledgeBaseId: input.targetKnowledgeBaseId,
        active: true
      },
      order: [["sortOrder", "ASC"]]
    });
    categoryId = fallback?.id;
  }

  const cloned = await createKnowledgeAsset({
    companyId: input.companyId,
    knowledgeBaseId: input.targetKnowledgeBaseId,
    categoryId,
    assetType: source.assetType,
    title: source.title,
    summary: source.summary,
    metadata:
      source.metadata && typeof source.metadata === "object"
        ? { ...(source.metadata as Record<string, unknown>) }
        : undefined,
    storageUrl: version.storageUrl,
    rawText: version.rawTextPreview || undefined,
    authorUserId: input.authorUserId
  });

  if (input.autoPublish) {
    return promoteAndPublishKnowledgeAsset(
      input.companyId,
      cloned.id,
      input.authorUserId
    );
  }

  return cloned;
};
