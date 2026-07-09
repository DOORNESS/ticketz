const CONFIG_FETCH_TIMEOUT_MS = 2500;

export async function loadConfig() {
  if (window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONFIG_FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch("/config.json", {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const config = await response.json();
    window.__APP_CONFIG__ = config;
    return config;
  } catch {
    if (window.__APP_CONFIG__) {
      return window.__APP_CONFIG__;
    }

    const hostname = window.location.hostname;
    if (hostname.endsWith("fortmax.com.br")) {
      const fallback = {
        REACT_APP_BACKEND_URL: "https://api.fortmax.com.br",
        BACKEND_PROTOCOL: "https",
        BACKEND_HOST: "api.fortmax.com.br",
        BACKEND_PATH: "",
        LOG_LEVEL: "info",
        TURNSTILE_SITE_KEY: "0x4AAAAAADhSILt9PsBiVeID"
      };
      window.__APP_CONFIG__ = fallback;
      return fallback;
    }

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
