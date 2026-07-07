import Setting from "../../models/Setting";

interface Request {
  key: string;
}

const publicSettingsKeys = [
  "allowSignup",
  "primaryColorLight",
  "primaryColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appName",
  "loginPageLinks",
  "loginSidePanelImage",
  "loginBackgroundContent",
  "vapidPublicKey",
  "extensionDownloadUrl",
  "turnstileSiteKey",
  "TURNSTILE_SITE_KEY",
  "cfTurnstileSiteKey"
];

const TURNSTILE_SITE_KEY_ALIASES = [
  "turnstileSiteKey",
  "TURNSTILE_SITE_KEY",
  "cfTurnstileSiteKey"
];

const readTurnstileSiteKeyFromEnv = (): string | null => {
  const found = TURNSTILE_SITE_KEY_ALIASES.map(alias =>
    process.env[alias]?.trim()
  ).find(value => Boolean(value));

  return found || null;
};

const GetPublicSettingService = async ({
  key
}: Request): Promise<string | undefined> => {
  if (!publicSettingsKeys.includes(key)) {
    return null;
  }

  const setting = await Setting.findOne({
    where: {
      companyId: 1,
      key
    }
  });

  if (setting?.value) {
    return setting.value;
  }

  if (TURNSTILE_SITE_KEY_ALIASES.includes(key)) {
    return readTurnstileSiteKeyFromEnv() || null;
  }

  return null;
};

export default GetPublicSettingService;
