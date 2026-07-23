import Company from "../../models/Company";
import Setting from "../../models/Setting";
import { logger } from "../../utils/logger";

const upsertSetting = async (
  companyId: number,
  key: string,
  value: string
): Promise<void> => {
  const [setting] = await Setting.findOrCreate({
    where: { key, companyId },
    defaults: { key, value, companyId }
  });

  if (setting.value !== value) {
    await setting.update({ value });
  }
};

const readEnv = (keys: string[]): string => {
  for (let i = 0; i < keys.length; i += 1) {
    const value = process.env[keys[i]]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
};

export const seedStorageSettingsFromEnv = async (): Promise<boolean> => {
  const keyId = readEnv([
    "B2_APPLICATION_KEY_ID",
    "B2_KEY_ID",
    "b2ApplicationKeyId"
  ]);
  const secretKey = readEnv(["B2_APPLICATION_KEY", "b2ApplicationKey"]);
  const bucket = readEnv(["B2_BUCKET", "B2_BUCKET_NAME", "b2Bucket"]);
  const endpoint = readEnv(["B2_ENDPOINT", "b2Endpoint"]);
  const publicUrl = readEnv(["B2_PUBLIC_URL", "b2PublicUrl"]);
  const provider =
    readEnv(["STORAGE_PROVIDER", "storageProvider"]) || "backblaze";

  if (!keyId || !secretKey || !bucket || !endpoint) {
    logger.warn(
      "B2 storage env incomplete — repository uploads will use local disk until B2_* vars or Settings are configured"
    );
    return false;
  }

  const companies = await Company.findAll({ attributes: ["id"] });

  await Promise.all(
    companies.map(async company => {
      await upsertSetting(company.id, "storageProvider", provider);
      await upsertSetting(company.id, "b2ApplicationKeyId", keyId);
      await upsertSetting(company.id, "b2ApplicationKey", secretKey);
      await upsertSetting(company.id, "b2Bucket", bucket);
      await upsertSetting(company.id, "b2Endpoint", endpoint);
      if (publicUrl) {
        await upsertSetting(company.id, "b2PublicUrl", publicUrl);
      }
    })
  );

  logger.info(
    { companies: companies.length, provider, bucket },
    "Backblaze B2 storage settings synced from environment"
  );

  return true;
};
