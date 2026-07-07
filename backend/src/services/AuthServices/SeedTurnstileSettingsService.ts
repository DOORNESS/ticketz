import Setting from "../../models/Setting";
import { logger } from "../../utils/logger";

const COMPANY_ID = 1;

const upsertSetting = async (key: string, value: string): Promise<void> => {
  const [setting] = await Setting.findOrCreate({
    where: { key, companyId: COMPANY_ID },
    defaults: { key, value, companyId: COMPANY_ID }
  });

  if (setting.value !== value) {
    await setting.update({ value });
  }
};

export const seedTurnstileSettingsFromEnv = async (): Promise<void> => {
  const siteKey =
    process.env.TURNSTILE_SITE_KEY ||
    process.env.turnstileSiteKey ||
    process.env.CF_TURNSTILE_SITE_KEY;
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.turnstileSecretKey ||
    process.env.CF_TURNSTILE_SECRET_KEY;

  if (!siteKey?.trim() || !secretKey?.trim()) {
    return;
  }

  await upsertSetting("turnstileSiteKey", siteKey.trim());
  await upsertSetting("turnstileSecretKey", secretKey.trim());
  logger.info("Cloudflare Turnstile settings synced from environment");
};
