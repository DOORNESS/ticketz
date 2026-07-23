import { GetCompanySetting } from "../../helpers/CheckSettings";
import { StorageProvider } from "./types";
import { getStorageKeyLayout, getStorageRegion } from "./storageEnv";

export type ResolvedStorageConfig = {
  provider: StorageProvider;
  keyId: string;
  secretKey: string;
  bucket: string;
  endpoint: string;
  publicUrl: string;
  rootPrefix: string;
  region: string;
};

const KEY_ALIASES = {
  provider: ["storageProvider"],
  keyId: [
    "b2ApplicationKeyId",
    "B2_APPLICATION_KEY_ID",
    "b2KeyId",
    "B2_KEY_ID"
  ],
  secretKey: ["b2ApplicationKey", "B2_APPLICATION_KEY"],
  bucket: ["b2Bucket", "B2_BUCKET", "B2_BUCKET_NAME"],
  endpoint: ["b2Endpoint", "B2_ENDPOINT"],
  publicUrl: ["b2PublicUrl", "B2_PUBLIC_URL"]
} as const;

const readSetting = async (
  companyId: number,
  aliases: readonly string[]
): Promise<string> => {
  for (let i = 0; i < aliases.length; i += 1) {
    const key = aliases[i];
    const value = await GetCompanySetting(companyId, key, null);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
};

const readEnv = (aliases: readonly string[]): string => {
  for (let i = 0; i < aliases.length; i += 1) {
    const key = aliases[i];
    const value = process.env[key];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
};

const normalizeProvider = (value: string): StorageProvider => {
  const normalized = value.toLowerCase();

  if (
    normalized === "backblaze" ||
    normalized === "b2" ||
    normalized === "s3" ||
    normalized === "r2" ||
    normalized === "minio"
  ) {
    return normalized === "b2" ? "backblaze" : (normalized as StorageProvider);
  }

  return "local";
};

export const loadStorageConfig = async (
  companyId: number
): Promise<ResolvedStorageConfig | null> => {
  const companyIds = Array.from(new Set([companyId, 1]));

  let provider = readEnv(KEY_ALIASES.provider);
  let keyId = readEnv(KEY_ALIASES.keyId);
  let secretKey = readEnv(KEY_ALIASES.secretKey);
  let bucket = readEnv(KEY_ALIASES.bucket);
  let endpoint = readEnv(KEY_ALIASES.endpoint);
  let publicUrl = readEnv(KEY_ALIASES.publicUrl);

  for (let i = 0; i < companyIds.length; i += 1) {
    const id = companyIds[i];
    if (!provider) provider = await readSetting(id, KEY_ALIASES.provider);
    if (!keyId) keyId = await readSetting(id, KEY_ALIASES.keyId);
    if (!secretKey) secretKey = await readSetting(id, KEY_ALIASES.secretKey);
    if (!bucket) bucket = await readSetting(id, KEY_ALIASES.bucket);
    if (!endpoint) endpoint = await readSetting(id, KEY_ALIASES.endpoint);
    if (!publicUrl) publicUrl = await readSetting(id, KEY_ALIASES.publicUrl);
  }

  if (!keyId || !secretKey || !bucket || !endpoint) {
    return null;
  }

  const resolvedProvider = normalizeProvider(provider || "backblaze");
  const rootPrefix =
    getStorageKeyLayout() === "legacy"
      ? (process.env.STORAGE_ROOT_PREFIX || "suporte").replace(/^\/+|\/+$/g, "")
      : "companies";

  return {
    provider: resolvedProvider,
    keyId,
    secretKey,
    bucket,
    endpoint,
    publicUrl: publicUrl.replace(/\/$/, ""),
    rootPrefix,
    region: readEnv(["B2_REGION", "STORAGE_REGION"]) || getStorageRegion()
  };
};
