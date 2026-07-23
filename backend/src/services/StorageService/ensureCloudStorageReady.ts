import AppError from "../../errors/AppError";
import { loadStorageConfig } from "./StorageConfigService";

export const ensureCloudStorageReady = async (
  companyId: number
): Promise<void> => {
  const config = await loadStorageConfig(companyId);

  if (!config) {
    throw new AppError("ERR_STORAGE_NOT_CONFIGURED", 503);
  }
};

export const isCloudStorageConfigured = async (
  companyId: number
): Promise<boolean> => Boolean(await loadStorageConfig(companyId));
