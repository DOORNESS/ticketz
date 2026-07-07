import "../bootstrap";
import "../database";
import Setting from "../models/Setting";
import { logger } from "../utils/logger";

const COMPANY_ID = 1;

const upsertSetting = async (key: string, value: string): Promise<void> => {
  const [setting] = await Setting.findOrCreate({
    where: { key, companyId: COMPANY_ID },
    defaults: { key, value, companyId: COMPANY_ID }
  });

  if (setting.value !== value) {
    await setting.update({ value });
  }

  logger.info({ key, companyId: COMPANY_ID }, "Turnstile setting upserted");
};

const run = async (): Promise<void> => {
  const siteKey =
    process.env.TURNSTILE_SITE_KEY ||
    process.env.turnstileSiteKey ||
    process.env.CF_TURNSTILE_SITE_KEY;
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.turnstileSecretKey ||
    process.env.CF_TURNSTILE_SECRET_KEY;

  if (!siteKey?.trim() || !secretKey?.trim()) {
    throw new Error(
      "Missing TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY environment variables"
    );
  }

  await upsertSetting("turnstileSiteKey", siteKey.trim());
  await upsertSetting("turnstileSecretKey", secretKey.trim());

  logger.info("Cloudflare Turnstile settings saved to database");
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error({ error }, "Failed to seed Turnstile settings");
    process.exit(1);
  });
