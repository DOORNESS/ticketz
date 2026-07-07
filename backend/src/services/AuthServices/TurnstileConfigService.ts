import Setting from "../../models/Setting";

const SITE_KEY_ALIASES = [
  "turnstileSiteKey",
  "TURNSTILE_SITE_KEY",
  "cfTurnstileSiteKey"
];

const SECRET_KEY_ALIASES = [
  "turnstileSecretKey",
  "TURNSTILE_SECRET_KEY",
  "cfTurnstileSecretKey"
];

const readEnv = (keys: string[]): string | null => {
  const found = keys
    .map(key => process.env[key]?.trim())
    .find(value => Boolean(value));
  return found || null;
};

const readSetting = async (keys: string[]): Promise<string | null> => {
  const results = await Promise.all(
    keys.map(async key => {
      const setting = await Setting.findOne({
        where: { companyId: 1, key }
      });
      return setting?.value?.trim() || null;
    })
  );

  return results.find(value => Boolean(value)) || null;
};

export const getTurnstileSiteKey = async (): Promise<string | null> =>
  (await readSetting(SITE_KEY_ALIASES)) || readEnv(SITE_KEY_ALIASES);

export const getTurnstileSecretKey = async (): Promise<string | null> =>
  (await readSetting(SECRET_KEY_ALIASES)) || readEnv(SECRET_KEY_ALIASES);

export const isTurnstileEnabled = async (): Promise<boolean> => {
  const siteKey = await getTurnstileSiteKey();
  const secretKey = await getTurnstileSecretKey();
  return Boolean(siteKey && secretKey);
};
