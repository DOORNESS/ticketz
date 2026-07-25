const LOCALHOST_DEFAULTS = {
  BACKEND_PROTOCOL: "http",
  BACKEND_HOST: "localhost",
  BACKEND_PORT: "8080",
  LOG_LEVEL: "debug"
};

const FORTMAX_DEFAULTS = {
  REACT_APP_BACKEND_URL: "https://api.fortmax.com.br",
  BACKEND_PROTOCOL: "https",
  BACKEND_HOST: "api.fortmax.com.br",
  BACKEND_PATH: "",
  LOG_LEVEL: "info"
};

function resolveConfig() {
  if (window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }

  const hostname = window.location.hostname;

  if (hostname.endsWith("fortmax.com.br")) {
    return FORTMAX_DEFAULTS;
  }

  if (["localhost", "127.0.0.1"].includes(hostname)) {
    return LOCALHOST_DEFAULTS;
  }

  throw new Error("Config not found");
}

export function getBackendURL() {
  const config = resolveConfig();

  if (config.REACT_APP_BACKEND_URL) {
    return config.REACT_APP_BACKEND_URL.replace(/\/$/, "");
  }

  const protocol = config.BACKEND_PROTOCOL ?? "https";
  const host = config.BACKEND_HOST;
  const port = config.BACKEND_PORT ? `:${config.BACKEND_PORT}` : "";
  const path = config.BACKEND_PATH ?? "";

  return `${protocol}://${host}${port}${path}`;
}

export function getBackendSocketURL() {
  const config = resolveConfig();

  if (config.REACT_APP_BACKEND_URL) {
    return config.REACT_APP_BACKEND_URL.replace(/\/$/, "");
  }

  const protocol = config.BACKEND_PROTOCOL ?? "https";
  const host = config.BACKEND_HOST;
  const port = config.BACKEND_PORT ? `:${config.BACKEND_PORT}` : "";

  return `${protocol}://${host}${port}`;
}

const config = new Proxy(
  {},
  {
    get(_target, prop) {
      return resolveConfig()[prop];
    }
  }
);

export default config;
