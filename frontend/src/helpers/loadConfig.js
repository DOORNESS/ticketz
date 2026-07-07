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
    return window.__APP_CONFIG__ || null;
  } finally {
    clearTimeout(timeoutId);
  }
}
