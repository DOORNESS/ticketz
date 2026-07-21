import React from "react";
import ReactDOM from "react-dom";
import CssBaseline from "@material-ui/core/CssBaseline";
import App from "./App";
import { loadConfig } from "./helpers/loadConfig";
import { i18n } from "./translate/i18n";
import axios from "axios";

import { API_WARMUP_ERRORS } from "./helpers/apiWarmup";

const BACKEND_RETRY_INTERVAL_SECONDS = 15;
const BACKEND_PROBE_TIMEOUT_MS = 45000;
let backendRetryTimeout = null;
let backendProbeStarted = false;
let appMounted = false;

function isBackendHealthy(response) {
  if (!response) {
    return false;
  }

  if (response.status >= 200 && response.status < 500) {
    return true;
  }

  if (response.status === 503 && API_WARMUP_ERRORS.has(response.data?.error)) {
    return true;
  }

  return response.data?.ok === true;
}

function clearBackendRetryTimers() {
  if (backendRetryTimeout) {
    clearTimeout(backendRetryTimeout);
    backendRetryTimeout = null;
  }
}

function getBackendProbeUrl(config) {
  const protocol = config.BACKEND_PROTOCOL || "https";
  const hostname = config.BACKEND_HOST || window.location.hostname;
  const port = config.BACKEND_PORT ? `:${config.BACKEND_PORT}` : "";
  const path =
    config.BACKEND_PATH ||
    (hostname === "localhost" || hostname !== window.location.hostname
      ? ""
      : "/backend");

  return `${protocol}://${hostname}${port}${path}`;
}

function getRetryMessage(error) {
  if (error?.response?.data?.error === "ERR_SESSION_SECRET_UNAVAILABLE") {
    return i18n.t("frontendErrors.ERR_BACKEND_NOT_READY");
  }

  return i18n.t("frontendErrors.ERR_BACKEND_UNREACHABLE");
}

function showRetryMessage(message, onRetry) {
  if (appMounted) {
    clearBackendRetryTimers();
    backendRetryTimeout = setTimeout(() => {
      onRetry();
    }, BACKEND_RETRY_INTERVAL_SECONDS * 1000);
    return;
  }

  window.renderError(
    `${message}<br><br><button type="button" onclick="window.__retryBackend && window.__retryBackend()" style="margin-top:12px;padding:8px 16px;border:none;border-radius:6px;background:#d32f2f;color:#fff;cursor:pointer;">Tentar novamente</button>`
  );

  clearBackendRetryTimers();
  window.__retryBackend = () => {
    clearBackendRetryTimers();
    onRetry();
  };

  backendRetryTimeout = setTimeout(() => {
    clearBackendRetryTimers();
    onRetry();
  }, BACKEND_RETRY_INTERVAL_SECONDS * 1000);
}

function renderApp() {
  clearBackendRetryTimers();
  appMounted = true;
  ReactDOM.render(
    <CssBaseline>
      <App />
    </CssBaseline>,
    document.getElementById("root"),
    () => {
      window.finishProgress?.();
    }
  );
}

function probeBackendInBackground(config, attempt = 1) {
  if (backendProbeStarted) {
    return;
  }
  backendProbeStarted = true;

  const backendBase = getBackendProbeUrl(config);
  const healthUrl = `${backendBase}/health?cb=${Date.now()}`;

  axios
    .get(healthUrl, {
      timeout: BACKEND_PROBE_TIMEOUT_MS,
      validateStatus: () => true
    })
    .then(response => {
      if (isBackendHealthy(response)) {
        return response;
      }

      throw new Error("ERR_BACKEND_UNREACHABLE");
    })
    .catch(() => {
      const fallbackUrl = `${backendBase}/?cb=${Date.now()}`;
      return axios.get(fallbackUrl, {
        timeout: BACKEND_PROBE_TIMEOUT_MS,
        validateStatus: () => true
      });
    })
    .then(response => {
      if (isBackendHealthy(response)) {
        return;
      }

      throw new Error("ERR_BACKEND_UNREACHABLE");
    })
    .catch(error => {
      const retryMessage = getRetryMessage(error);
      showRetryMessage(retryMessage, () => {
        backendProbeStarted = false;
        probeBackendInBackground(config, attempt + 1);
      });
    });
}

async function bootstrap() {
  const config = await loadConfig();

  if (!config) {
    window.renderError(i18n.t("frontendErrors.ERR_CONFIG_ERROR"));
    return;
  }

  renderApp();
  probeBackendInBackground(config);
}

bootstrap();
