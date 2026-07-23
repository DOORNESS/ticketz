import { Op } from "sequelize";
import mime from "mime-types";
import AppError from "../../errors/AppError";
import ContentRepositoryItem, {
  ContentRepositoryType
} from "../../models/ContentRepositoryItem";
import ContentRepositoryItemVersion from "../../models/ContentRepositoryItemVersion";
import ContentRepositoryFavorite from "../../models/ContentRepositoryFavorite";
import ContentRepositoryCategory from "../../models/ContentRepositoryCategory";
import ContentRepositoryUsageLog from "../../models/ContentRepositoryUsageLog";
import User from "../../models/User";
import Ticket from "../../models/Ticket";
import KnowledgeAsset, {
  KnowledgeAssetType
} from "../../models/KnowledgeAsset";
import StorageService from "../StorageService/StorageService";
import { ensureCloudStorageReady } from "../StorageService/ensureCloudStorageReady";
import { createKnowledgeAsset } from "../AiServices/KnowledgeCms/KnowledgeAssetCmsService";
import { ingestKnowledgeAssetVersion } from "../AiServices/KnowledgeCms/ingestKnowledgeAssetVersion";
import KnowledgeAssetVersion from "../../models/KnowledgeAssetVersion";
import { assertRepositoryPermission } from "./ContentRepositoryPermissionService";

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "sh",
  "msi",
  "dll",
  "scr",
  "com",
  "vbs",
  "js",
  "jar"
]);

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type RepositoryListFilters = {
  companyId: number;
  search?: string;
  contentType?: string;
  category?: string;
  categoryId?: number;
  tag?: string;
  active?: boolean;
  allowHumanUse?: boolean;
  allowAiUse?: boolean;
  knowledgeDomainId?: number;
  limit?: number;
  offset?: number;
  sortBy?: "recent" | "popular" | "name";
};

export type RepositoryAccessContext = {
  userId: number;
  profile: string;
  companyId: number;
  queueIds?: number[];
  aiAgentId?: number;
  forAi?: boolean;
};

const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map(tag => String(tag).trim()).filter(Boolean);
};

const inferContentType = (
  mimeType: string,
  fileName: string
): ContentRepositoryType => {
  const mimeLower = (mimeType || "").toLowerCase();
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  if (mimeLower.startsWith("image/")) return "image";
  if (mimeLower.startsWith("audio/")) return "audio";
  if (mimeLower.startsWith("video/")) return "video";
  if (mimeLower === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mimeLower.includes("word") ||
    ext === "doc" ||
    ext === "docx" ||
    ext === "odt"
  ) {
    return "document";
  }
  return "file";
};

export const assertRepositoryFileAllowed = (
  fileName: string,
  mimeType: string,
  sizeBytes: number
): void => {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new AppError("ERR_REPOSITORY_FILE_BLOCKED", 400);
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new AppError("ERR_REPOSITORY_FILE_TOO_LARGE", 400);
  }
  const detected = mime.extension(mimeType || "") || ext;
  if (BLOCKED_EXTENSIONS.has(String(detected))) {
    throw new AppError("ERR_REPOSITORY_FILE_BLOCKED", 400);
  }
};

export const buildRepositoryAccessForTicket = (
  ticket: Ticket,
  user: User,
  options: { forAi?: boolean; aiAgentId?: number } = {}
): RepositoryAccessContext => {
  const userQueueIds =
    user.profile === "admin" ? [] : (user.queues || []).map(q => q.id);

  return {
    userId: user.id,
    profile: user.super ? "admin" : user.profile,
    companyId: ticket.companyId,
    queueIds: ticket.queueId ? [ticket.queueId, ...userQueueIds] : userQueueIds,
    aiAgentId: options.aiAgentId || ticket.aiAgentId || undefined,
    forAi: options.forAi
  };
};

export const canAccessRepositoryItem = (
  item: ContentRepositoryItem,
  ctx: RepositoryAccessContext
): boolean => {
  if (item.companyId !== ctx.companyId) {
    return false;
  }
  if (item.archivedAt || !item.active) {
    return false;
  }
  if (ctx.forAi) {
    if (!item.allowAiUse || !item.useForDelivery) {
      return false;
    }
  } else if (!item.allowHumanUse || !item.useForDelivery) {
    return false;
  }

  if (ctx.profile === "admin" || ctx.profile === "supervisor") {
    return true;
  }

  const queueIds = item.queueIds || [];
  if (queueIds.length && ctx.queueIds?.length) {
    if (!queueIds.some(id => ctx.queueIds?.includes(Number(id)))) {
      return false;
    }
  }

  const agentIds = item.agentIds || [];
  if (agentIds.length) {
    if (!agentIds.includes(ctx.userId)) {
      return false;
    }
  }

  const aiAgentIds = item.aiAgentIds || [];
  if (ctx.forAi && aiAgentIds.length && ctx.aiAgentId) {
    if (!aiAgentIds.includes(ctx.aiAgentId)) {
      return false;
    }
  }

  return true;
};

export const listRepositoryItems = async (
  filters: RepositoryListFilters,
  access?: RepositoryAccessContext
) => {
  const where: Record<string, unknown> = {
    companyId: filters.companyId,
    archivedAt: { [Op.is]: null }
  };

  if (filters.active !== undefined) {
    where.active = filters.active;
  }
  if (filters.contentType) {
    where.contentType = filters.contentType;
  }
  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }
  if (filters.category) {
    where.category = filters.category;
  }
  if (filters.knowledgeDomainId) {
    where.knowledgeDomainId = filters.knowledgeDomainId;
  }
  if (filters.allowHumanUse !== undefined) {
    where.allowHumanUse = filters.allowHumanUse;
  }
  if (filters.allowAiUse !== undefined) {
    where.allowAiUse = filters.allowAiUse;
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    Object.assign(where, {
      [Op.or]: [
        { name: { [Op.iLike]: term } },
        { displayTitle: { [Op.iLike]: term } },
        { description: { [Op.iLike]: term } },
        { sendCaption: { [Op.iLike]: term } }
      ]
    });
  }

  const order: [string, string][] =
    filters.sortBy === "popular"
      ? [["usageCount", "DESC"]]
      : filters.sortBy === "name"
        ? [["name", "ASC"]]
        : [["updatedAt", "DESC"]];

  const rows = await ContentRepositoryItem.findAll({
    where,
    order,
    limit: filters.limit || 50,
    offset: filters.offset || 0
  });

  let filtered = rows;
  if (access) {
    filtered = rows.filter(item => canAccessRepositoryItem(item, access));
  }

  if (filters.tag) {
    filtered = filtered.filter(item =>
      (item.tags || []).includes(filters.tag as string)
    );
  }

  return filtered;
};

export const getRepositoryItem = async (
  companyId: number,
  itemId: number
): Promise<ContentRepositoryItem> => {
  const item = await ContentRepositoryItem.findOne({
    where: { id: itemId, companyId, archivedAt: { [Op.is]: null } },
    include: [
      { model: ContentRepositoryItemVersion, as: "versions" },
      { model: ContentRepositoryCategory, as: "categoryRef" }
    ]
  });
  if (!item) {
    throw new AppError("ERR_REPOSITORY_ITEM_NOT_FOUND", 404);
  }
  return item;
};

const maybeLinkKnowledgeAsset = async (input: {
  item: ContentRepositoryItem;
  companyId: number;
  authorUserId?: number;
  knowledgeBaseId?: number;
}): Promise<void> => {
  if (!input.item.useForKnowledge || !input.knowledgeBaseId) {
    return;
  }
  if (!input.item.storageKey) {
    return;
  }

  const assetType: KnowledgeAssetType =
    input.item.contentType === "pdf"
      ? "pdf"
      : input.item.contentType === "document"
        ? "word"
        : input.item.contentType === "image"
          ? "image_ocr"
          : "document";

  const storageUrl = StorageService.getPublicUrl(input.item.storageKey);
  const asset = await createKnowledgeAsset({
    companyId: input.companyId,
    authorUserId: input.authorUserId,
    knowledgeBaseId: input.knowledgeBaseId,
    title: input.item.displayTitle || input.item.name,
    summary: input.item.description || input.item.sendCaption || "",
    assetType,
    storageUrl,
    metadata: {
      repositoryItemId: input.item.id,
      source: "content_repository",
      checksum: input.item.checksum
    }
  });

  await input.item.update({ knowledgeAssetId: asset.id });
};

export const createRepositoryItem = async (input: {
  companyId: number;
  authorUserId?: number;
  name: string;
  displayTitle?: string;
  contentType: ContentRepositoryType;
  category?: string;
  categoryId?: number;
  description?: string;
  sendCaption?: string;
  externalUrl?: string;
  tags?: string[];
  knowledgeDomainId?: number;
  knowledgeBaseId?: number;
  queueIds?: number[];
  agentIds?: number[];
  aiAgentIds?: number[];
  active?: boolean;
  allowAiUse?: boolean;
  allowHumanUse?: boolean;
  useForKnowledge?: boolean;
  useForDelivery?: boolean;
  file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}): Promise<ContentRepositoryItem> => {
  let storageKey: string | undefined;
  let checksum: string | undefined;
  let mimeType = input.file?.mimetype;
  let originalFileName = input.file?.originalname;
  let fileSize = input.file?.size;

  if (input.file) {
    assertRepositoryFileAllowed(
      input.file.originalname,
      input.file.mimetype,
      input.file.size
    );
    await ensureCloudStorageReady(input.companyId);
    await StorageService.ensureReady(input.companyId);
    const uploaded = await StorageService.uploadBuffer(input.file.buffer, {
      companyId: input.companyId,
      filename: input.file.originalname,
      contentType: input.file.mimetype,
      folder: "repository",
      uploadedByUserId: input.authorUserId
    });
    storageKey = uploaded.key;
    checksum = uploaded.hash;
    mimeType = input.file.mimetype;
    originalFileName = input.file.originalname;
    fileSize = input.file.size;
  }

  const item = await ContentRepositoryItem.create({
    companyId: input.companyId,
    name: input.name,
    displayTitle: input.displayTitle || input.name,
    contentType: input.contentType,
    category: input.category || null,
    categoryId: input.categoryId || null,
    description: input.description || null,
    sendCaption: input.sendCaption || null,
    storageKey: storageKey || null,
    originalFileName: originalFileName || null,
    fileSize: fileSize || null,
    mimeType: mimeType || null,
    externalUrl: input.externalUrl || null,
    tags: normalizeTags(input.tags),
    knowledgeDomainId: input.knowledgeDomainId || null,
    knowledgeBaseId: input.knowledgeBaseId || null,
    queueIds: input.queueIds || [],
    agentIds: input.agentIds || [],
    aiAgentIds: input.aiAgentIds || [],
    active: input.active !== false,
    allowAiUse: !!input.allowAiUse,
    allowHumanUse: input.allowHumanUse !== false,
    useForKnowledge: !!input.useForKnowledge,
    useForDelivery: input.useForDelivery !== false,
    authorUserId: input.authorUserId || null,
    checksum: checksum || null,
    currentVersion: 1
  });

  if (storageKey) {
    await ContentRepositoryItemVersion.create({
      companyId: input.companyId,
      repositoryItemId: item.id,
      versionNumber: 1,
      storageKey,
      originalFileName,
      fileSize,
      mimeType,
      checksum,
      authorUserId: input.authorUserId || null,
      changeReason: "initial_upload"
    });
  }

  if (input.useForKnowledge && input.knowledgeBaseId) {
    await maybeLinkKnowledgeAsset({
      item,
      companyId: input.companyId,
      authorUserId: input.authorUserId,
      knowledgeBaseId: input.knowledgeBaseId
    });
  }

  return item;
};

export const createRepositoryItemFromUpload = async (input: {
  companyId: number;
  authorUserId?: number;
  file: Express.Multer.File;
  payload: Record<string, unknown>;
}): Promise<ContentRepositoryItem> => {
  const contentType =
    (input.payload.contentType as ContentRepositoryType) ||
    inferContentType(input.file.mimetype, input.file.originalname);

  return createRepositoryItem({
    companyId: input.companyId,
    authorUserId: input.authorUserId,
    name: String(input.payload.name || input.file.originalname),
    displayTitle: String(
      input.payload.displayTitle ||
        input.payload.name ||
        input.file.originalname
    ),
    contentType,
    category: input.payload.category
      ? String(input.payload.category)
      : undefined,
    description: input.payload.description
      ? String(input.payload.description)
      : undefined,
    sendCaption: input.payload.sendCaption
      ? String(input.payload.sendCaption)
      : undefined,
    tags: normalizeTags(input.payload.tags),
    knowledgeDomainId: input.payload.knowledgeDomainId
      ? Number(input.payload.knowledgeDomainId)
      : undefined,
    knowledgeBaseId: input.payload.knowledgeBaseId
      ? Number(input.payload.knowledgeBaseId)
      : undefined,
    queueIds: Array.isArray(input.payload.queueIds)
      ? input.payload.queueIds.map(Number)
      : [],
    agentIds: Array.isArray(input.payload.agentIds)
      ? input.payload.agentIds.map(Number)
      : [],
    aiAgentIds: Array.isArray(input.payload.aiAgentIds)
      ? input.payload.aiAgentIds.map(Number)
      : [],
    active: input.payload.active !== false,
    allowAiUse:
      input.payload.allowAiUse === true || input.payload.allowAiUse === "true",
    allowHumanUse:
      input.payload.allowHumanUse !== false &&
      input.payload.allowHumanUse !== "false",
    useForKnowledge:
      input.payload.useForKnowledge === true ||
      input.payload.useForKnowledge === "true",
    useForDelivery:
      input.payload.useForDelivery !== false &&
      input.payload.useForDelivery !== "false",
    file: {
      buffer: input.file.buffer,
      originalname: input.file.originalname,
      mimetype: input.file.mimetype,
      size: input.file.size
    }
  });
};

export const updateRepositoryItem = async (input: {
  companyId: number;
  itemId: number;
  authorUserId?: number;
  changes: Partial<ContentRepositoryItem>;
  file?: Express.Multer.File;
  changeReason?: string;
}): Promise<ContentRepositoryItem> => {
  const item = await getRepositoryItem(input.companyId, input.itemId);

  if (input.file) {
    assertRepositoryFileAllowed(
      input.file.originalname,
      input.file.mimetype,
      input.file.size
    );
    await ensureCloudStorageReady(input.companyId);
    await StorageService.ensureReady(input.companyId);
    const uploaded = await StorageService.uploadBuffer(input.file.buffer, {
      companyId: input.companyId,
      filename: input.file.originalname,
      contentType: input.file.mimetype,
      folder: "repository",
      uploadedByUserId: input.authorUserId
    });

    const nextVersion = item.currentVersion + 1;
    await ContentRepositoryItemVersion.create({
      companyId: input.companyId,
      repositoryItemId: item.id,
      versionNumber: nextVersion,
      storageKey: uploaded.key,
      originalFileName: input.file.originalname,
      fileSize: input.file.size,
      mimeType: input.file.mimetype,
      checksum: uploaded.hash,
      authorUserId: input.authorUserId || null,
      changeReason: input.changeReason || "file_replaced"
    });

    await item.update({
      ...input.changes,
      storageKey: uploaded.key,
      originalFileName: input.file.originalname,
      fileSize: input.file.size,
      mimeType: input.file.mimetype,
      checksum: uploaded.hash,
      currentVersion: nextVersion
    });
    return item.reload();
  }

  await item.update(input.changes);
  return item.reload();
};

export const archiveRepositoryItem = async (
  companyId: number,
  itemId: number
): Promise<void> => {
  const item = await getRepositoryItem(companyId, itemId);
  await item.update({ active: false, archivedAt: new Date() });
};

export const recordRepositoryUsage = async (input: {
  item: ContentRepositoryItem;
  companyId: number;
  ticketId?: number;
  userId?: number;
  channel?: string;
  source?: "human" | "ai";
  aiAgentId?: number;
  success?: boolean;
  errorCode?: string;
}): Promise<void> => {
  await input.item.update({
    usageCount: (input.item.usageCount || 0) + 1,
    lastUsedAt: new Date()
  });

  await ContentRepositoryUsageLog.create({
    companyId: input.companyId,
    repositoryItemId: input.item.id,
    ticketId: input.ticketId || null,
    userId: input.userId || null,
    channel: input.channel || null,
    source: input.source || "human",
    aiAgentId: input.aiAgentId || null,
    success: input.success !== false,
    errorCode: input.errorCode || null
  });
};

export const toggleRepositoryFavorite = async (input: {
  companyId: number;
  userId: number;
  itemId: number;
}): Promise<{ favorited: boolean }> => {
  const existing = await ContentRepositoryFavorite.findOne({
    where: {
      companyId: input.companyId,
      userId: input.userId,
      repositoryItemId: input.itemId
    }
  });

  if (existing) {
    await existing.destroy();
    return { favorited: false };
  }

  await ContentRepositoryFavorite.create({
    companyId: input.companyId,
    userId: input.userId,
    repositoryItemId: input.itemId
  });
  return { favorited: true };
};

export const listRepositoryForTicket = async (input: {
  ticket: Ticket;
  user: User;
  search?: string;
  contentType?: string;
  category?: string;
  categoryId?: number;
}) => {
  return listRepositoryItems(
    {
      companyId: input.ticket.companyId,
      search: input.search,
      contentType: input.contentType,
      category: input.category,
      categoryId: input.categoryId,
      allowHumanUse: true,
      active: true,
      limit: 100,
      sortBy: "popular"
    },
    buildRepositoryAccessForTicket(input.ticket, input.user)
  );
};

export const searchRepositoryForAi = async (input: {
  companyId: number;
  query: string;
  contentType?: string;
  category?: string;
  tag?: string;
  knowledgeDomainId?: number;
  queueId?: number;
  aiAgentId?: number;
  limit?: number;
}) => {
  const items = await listRepositoryItems(
    {
      companyId: input.companyId,
      search: input.query,
      contentType: input.contentType,
      category: input.category,
      tag: input.tag,
      knowledgeDomainId: input.knowledgeDomainId,
      allowAiUse: true,
      active: true,
      limit: input.limit || 10,
      sortBy: "popular"
    },
    {
      userId: 0,
      profile: "admin",
      companyId: input.companyId,
      queueIds: input.queueId ? [input.queueId] : [],
      aiAgentId: input.aiAgentId,
      forAi: true
    }
  );

  return items.map(item => ({
    id: item.id,
    name: item.name,
    displayTitle: item.displayTitle,
    contentType: item.contentType,
    category: item.category,
    description: item.description,
    sendCaption: item.sendCaption,
    tags: item.tags,
    mimeType: item.mimeType,
    externalUrl: item.externalUrl
  }));
};

export const resolveRepositoryMime = (item: ContentRepositoryItem): string => {
  const fromName = item.originalFileName
    ? mime.lookup(item.originalFileName)
    : false;
  const raw = item.mimeType || fromName || "application/octet-stream";
  const normalized = String(raw).split(";")[0].trim().toLowerCase();

  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  if (
    item.contentType === "image" &&
    (!normalized.startsWith("image/") ||
      normalized === "application/octet-stream")
  ) {
    return "image/jpeg";
  }

  return normalized || "application/octet-stream";
};

export const assertRepositoryAccess = async (
  action: Parameters<typeof assertRepositoryPermission>[0],
  user: Pick<User, "id" | "profile" | "companyId" | "super">,
  companyId: number
): Promise<void> => {
  await assertRepositoryPermission(action, companyId, user);
};

const mapItemJson = (
  item: ContentRepositoryItem,
  extra: Record<string, unknown> = {}
) => ({
  ...item.toJSON(),
  hasStorageFile: Boolean(item.storageKey),
  previewAvailable:
    Boolean(item.storageKey) ||
    item.contentType === "text" ||
    item.contentType === "link",
  ...extra
});

export const attachFavoriteFlags = async (
  items: ContentRepositoryItem[],
  companyId: number,
  userId: number
): Promise<Record<string, unknown>[]> => {
  if (!items.length) {
    return [];
  }
  const favorites = await ContentRepositoryFavorite.findAll({
    where: {
      companyId,
      userId,
      repositoryItemId: { [Op.in]: items.map(i => i.id) }
    }
  });
  const favSet = new Set(favorites.map(f => f.repositoryItemId));
  return items.map(item =>
    mapItemJson(item, { favorited: favSet.has(item.id) })
  );
};

export const listFavoriteRepositoryItems = async (input: {
  companyId: number;
  userId: number;
  access?: RepositoryAccessContext;
  limit?: number;
}) => {
  const favorites = await ContentRepositoryFavorite.findAll({
    where: { companyId: input.companyId, userId: input.userId },
    order: [["updatedAt", "DESC"]],
    limit: input.limit || 50
  });
  if (!favorites.length) {
    return [];
  }

  const items = await ContentRepositoryItem.findAll({
    where: {
      id: { [Op.in]: favorites.map(f => f.repositoryItemId) },
      companyId: input.companyId,
      archivedAt: { [Op.is]: null },
      active: true
    }
  });

  let filtered = items;
  if (input.access) {
    filtered = items.filter(item =>
      canAccessRepositoryItem(item, input.access!)
    );
  }

  const orderMap = new Map(
    favorites.map((f, idx) => [f.repositoryItemId, idx])
  );
  filtered.sort(
    (a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0)
  );
  return attachFavoriteFlags(filtered, input.companyId, input.userId);
};

export const listRecentRepositoryItemsForUser = async (input: {
  companyId: number;
  userId: number;
  access?: RepositoryAccessContext;
  limit?: number;
}) => {
  const logs = await ContentRepositoryUsageLog.findAll({
    where: { companyId: input.companyId, userId: input.userId, success: true },
    order: [["createdAt", "DESC"]],
    limit: 200
  });

  const seen = new Set<number>();
  const itemIds: number[] = [];
  for (const log of logs) {
    if (seen.has(log.repositoryItemId)) continue;
    seen.add(log.repositoryItemId);
    itemIds.push(log.repositoryItemId);
    if (itemIds.length >= (input.limit || 20)) break;
  }

  if (!itemIds.length) {
    return [];
  }

  const items = await ContentRepositoryItem.findAll({
    where: {
      id: { [Op.in]: itemIds },
      companyId: input.companyId,
      archivedAt: { [Op.is]: null },
      active: true
    }
  });

  let filtered = items;
  if (input.access) {
    filtered = items.filter(item =>
      canAccessRepositoryItem(item, input.access!)
    );
  }

  const orderMap = new Map(itemIds.map((id, idx) => [id, idx]));
  filtered.sort(
    (a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0)
  );
  return attachFavoriteFlags(filtered, input.companyId, input.userId);
};

export const listPopularRepositoryItems = async (
  filters: RepositoryListFilters,
  access?: RepositoryAccessContext
) =>
  attachFavoriteFlags(
    await listRepositoryItems({ ...filters, sortBy: "popular" }, access),
    filters.companyId,
    access?.userId || 0
  );

export const listRepositoryCategories = async (
  companyId: number,
  includeArchived = false
): Promise<ContentRepositoryCategory[]> => {
  const where: Record<string, unknown> = { companyId };
  if (!includeArchived) {
    where.archivedAt = { [Op.is]: null };
    where.active = true;
  }
  return ContentRepositoryCategory.findAll({
    where,
    order: [
      ["sortOrder", "ASC"],
      ["name", "ASC"]
    ]
  });
};

export const createRepositoryCategory = async (input: {
  companyId: number;
  slug: string;
  name: string;
  icon?: string;
  sortOrder?: number;
  allowAiUse?: boolean;
  queueIds?: number[];
}): Promise<ContentRepositoryCategory> =>
  ContentRepositoryCategory.create({
    companyId: input.companyId,
    slug: input.slug,
    name: input.name,
    icon: input.icon || "other",
    sortOrder: input.sortOrder ?? 100,
    allowAiUse: input.allowAiUse !== false,
    queueIds: input.queueIds || [],
    active: true
  });

export const updateRepositoryCategory = async (input: {
  companyId: number;
  categoryId: number;
  changes: Partial<ContentRepositoryCategory>;
}): Promise<ContentRepositoryCategory> => {
  const category = await ContentRepositoryCategory.findOne({
    where: { id: input.categoryId, companyId: input.companyId }
  });
  if (!category) {
    throw new AppError("ERR_REPOSITORY_CATEGORY_NOT_FOUND", 404);
  }
  await category.update(input.changes);
  return category.reload();
};

export const archiveRepositoryCategory = async (
  companyId: number,
  categoryId: number
): Promise<void> => {
  const category = await ContentRepositoryCategory.findOne({
    where: { id: categoryId, companyId }
  });
  if (!category) {
    throw new AppError("ERR_REPOSITORY_CATEGORY_NOT_FOUND", 404);
  }
  await category.update({ active: false, archivedAt: new Date() });
};

export const listItemVersions = async (
  companyId: number,
  itemId: number
): Promise<ContentRepositoryItemVersion[]> => {
  await getRepositoryItem(companyId, itemId);
  return ContentRepositoryItemVersion.findAll({
    where: { companyId, repositoryItemId: itemId },
    order: [["versionNumber", "DESC"]]
  });
};

export const compareItemVersions = async (input: {
  companyId: number;
  itemId: number;
  versionA: number;
  versionB: number;
}) => {
  const versions = await listItemVersions(input.companyId, input.itemId);
  const a = versions.find(v => v.versionNumber === input.versionA);
  const b = versions.find(v => v.versionNumber === input.versionB);
  if (!a || !b) {
    throw new AppError("ERR_REPOSITORY_VERSION_NOT_FOUND", 404);
  }
  return {
    versionA: a,
    versionB: b,
    diff: {
      storageChanged: a.storageKey !== b.storageKey,
      checksumChanged: a.checksum !== b.checksum,
      fileNameChanged: a.originalFileName !== b.originalFileName,
      mimeChanged: a.mimeType !== b.mimeType
    }
  };
};

export const restoreItemVersion = async (input: {
  companyId: number;
  itemId: number;
  versionNumber: number;
  authorUserId?: number;
  changeReason?: string;
}): Promise<ContentRepositoryItem> => {
  const item = await getRepositoryItem(input.companyId, input.itemId);
  const version = await ContentRepositoryItemVersion.findOne({
    where: {
      companyId: input.companyId,
      repositoryItemId: input.itemId,
      versionNumber: input.versionNumber
    }
  });

  if (!version?.storageKey) {
    throw new AppError("ERR_REPOSITORY_VERSION_FILE_MISSING", 400);
  }

  try {
    await StorageService.download(version.storageKey, input.companyId);
  } catch {
    throw new AppError("ERR_REPOSITORY_VERSION_FILE_MISSING", 400);
  }

  const nextVersion = item.currentVersion + 1;
  await ContentRepositoryItemVersion.create({
    companyId: input.companyId,
    repositoryItemId: item.id,
    versionNumber: nextVersion,
    storageKey: version.storageKey,
    originalFileName: version.originalFileName,
    fileSize: version.fileSize,
    mimeType: version.mimeType,
    checksum: version.checksum,
    authorUserId: input.authorUserId || null,
    changeReason: input.changeReason || `restore_from_v${input.versionNumber}`
  });

  await item.update({
    storageKey: version.storageKey,
    originalFileName: version.originalFileName,
    fileSize: version.fileSize,
    mimeType: version.mimeType,
    checksum: version.checksum,
    currentVersion: nextVersion
  });

  return item.reload();
};

export const reprocessRepositoryKnowledge = async (input: {
  companyId: number;
  itemId: number;
  authorUserId?: number;
}): Promise<ContentRepositoryItem> => {
  const item = await getRepositoryItem(input.companyId, input.itemId);
  if (!item.useForKnowledge || !item.knowledgeBaseId || !item.storageKey) {
    throw new AppError("ERR_REPOSITORY_KB_NOT_LINKED", 400);
  }

  await maybeLinkKnowledgeAsset({
    item,
    companyId: input.companyId,
    authorUserId: input.authorUserId,
    knowledgeBaseId: item.knowledgeBaseId
  });

  const reloaded = await item.reload();
  if (reloaded.knowledgeAssetId) {
    const asset = await KnowledgeAsset.findByPk(reloaded.knowledgeAssetId, {
      include: [{ model: KnowledgeAssetVersion, as: "currentVersion" }]
    });
    const versionId = asset?.currentVersion?.id || asset?.currentVersionId;
    if (versionId) {
      await ingestKnowledgeAssetVersion(input.companyId, versionId);
    }
  }

  return reloaded;
};

export const unlinkRepositoryKnowledge = async (
  companyId: number,
  itemId: number
): Promise<ContentRepositoryItem> => {
  const item = await getRepositoryItem(companyId, itemId);
  await item.update({
    useForKnowledge: false,
    knowledgeAssetId: null,
    knowledgeBaseId: null
  });
  return item.reload();
};

export const getRepositoryKnowledgeStatus = async (
  companyId: number,
  itemId: number
) => {
  const item = await getRepositoryItem(companyId, itemId);
  if (!item.knowledgeAssetId) {
    return {
      linked: false,
      knowledgeBaseId: item.knowledgeBaseId,
      useForKnowledge: item.useForKnowledge
    };
  }

  const asset = await KnowledgeAsset.findOne({
    where: { id: item.knowledgeAssetId, companyId },
    include: [{ model: KnowledgeAssetVersion, as: "currentVersion" }]
  });

  return {
    linked: true,
    knowledgeBaseId: item.knowledgeBaseId,
    knowledgeAssetId: item.knowledgeAssetId,
    assetTitle: asset?.title,
    ingestionStatus: asset?.currentVersion?.ingestionStatus || null,
    versionNumber: asset?.currentVersion?.versionNumber || null,
    errorMessage: asset?.currentVersion?.errorMessage || null
  };
};
