import React from "react";
import ReactDOM from "react-dom";
import CssBaseline from "@material-ui/core/CssBaseline";
import App from "./App";
import { loadJSON } from "./helpers/loadJSON";
import { i18n } from "./translate/i18n";
import axios from "axios";

const BACKEND_RETRY_INTERVAL_SECONDS = 15;
const BACKEND_PROBE_TIMEOUT_MS = 5000;
let backendRetryTimeout = null;

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

function probeBackendAndRender(config, attempt = 1) {
  const backendBase = getBackendProbeUrl(config);
  const healthUrl = `${backendBase}/health?cb=${Date.now()}`;

  axios
    .get(healthUrl, { timeout: BACKEND_PROBE_TIMEOUT_MS })
    .then(() => {
      renderApp();
    })
    .catch(() => {
      const fallbackUrl = `${backendBase}/?cb=${Date.now()}`;
      axios
        .get(fallbackUrl, { timeout: BACKEND_PROBE_TIMEOUT_MS })
        .then(response => {
          const serverDate = new Date(response.headers["date"]);
          const clientDate = new Date();
          const diff = Math.abs(serverDate - clientDate);
          const diffMinutes = Math.floor(diff / 1000 / 60);

          if (diffMinutes > 5) {
            let message = i18n.t("frontendErrors.ERR_CLOCK_OUT_OF_SYNC");
            message += `<br><br>${i18n.t("common.serverTime")} ${serverDate.toLocaleString()}`;
            message += `<br>${i18n.t("common.clientTime")} ${clientDate.toLocaleString()}`;
            message += `<br>${i18n.t("common.differenceMinutes", { count: diffMinutes })}`;
            window.renderError(message);
            return;
          }

          renderApp();
        })
        .catch(error => {
          const retryMessage = getRetryMessage(error);
          showRetryMessage(retryMessage, () => {
            probeBackendAndRender(config, attempt + 1);
          });
        });
    });
}

const config = loadJSON("/config.json");

if (!config) {
  window.renderError(i18n.t("frontendErrors.ERR_CONFIG_ERROR"));
} else {
  probeBackendAndRender(config);
}
