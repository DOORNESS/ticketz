import config from "../services/config";

export const getConfiguredTurnstileSiteKey = () => {
  const candidates = [
    config.TURNSTILE_SITE_KEY,
    config.turnstileSiteKey,
    config.CF_TURNSTILE_SITE_KEY,
    window.__APP_CONFIG__?.TURNSTILE_SITE_KEY,
    window.__APP_CONFIG__?.turnstileSiteKey
  ];

  const found = candidates.find(value => value != null && String(value).trim());
  return found ? String(found).trim() : "";
};

export const resolveTurnstileSiteKey = (...settingValues) => {
  const fromSettings = settingValues.find(
    value => value != null && String(value).trim()
  );

  if (fromSettings) {
    return String(fromSettings).trim();
  }

  return getConfiguredTurnstileSiteKey();
};
