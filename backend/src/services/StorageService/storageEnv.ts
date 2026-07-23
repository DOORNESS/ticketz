export const getStorageRegion = (): string =>
  process.env.B2_REGION ||
  process.env.STORAGE_REGION ||
  "us-east-005";

export const getSignedUrlTtlSeconds = (): number => {
  const parsed = Number(process.env.B2_SIGNED_URL_TTL_SECONDS || "900");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 900;
};

export const getMediaRetentionDays = (): number => {
  const parsed = Number(process.env.MEDIA_RETENTION_DAYS || "60");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
};

export const getMediaCleanupBatchSize = (): number => {
  const parsed = Number(process.env.MEDIA_CLEANUP_BATCH_SIZE || "500");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
};

export const isMediaCleanupEnabled = (): boolean =>
  process.env.MEDIA_CLEANUP_ENABLED !== "false";

export const usePrivateObjectAccess = (): boolean =>
  process.env.B2_USE_PRIVATE_ACCESS !== "false";

export const getStorageKeyLayout = (): "companies" | "legacy" => {
  const layout = (process.env.STORAGE_KEY_LAYOUT || "companies").toLowerCase();
  return layout === "legacy" ? "legacy" : "companies";
};

export const getOrphanMinAgeDays = (): number => {
  const parsed = Number(process.env.MEDIA_ORPHAN_MIN_AGE_DAYS || "7");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
};
