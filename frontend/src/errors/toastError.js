import { toast } from "react-toastify";
import { i18n } from "../translate/i18n";
import { isString } from "lodash";
import { API_WARMUP_ERRORS } from "../helpers/apiWarmup";

const MIGRATION_PENDING_PATTERN = /migrations pending/i;
const AI_PLATFORM_NOT_READY_PATTERN = /AI platform is not ready/i;

const toastOptions = {
  autoClose: 4000,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "light"
};

const LEGACY_ERROR_ALIASES = {
  "Esse nome já está sendo utilizado por outra conexão": "ERR_WAPP_NAME_IN_USE",
  "This whatsapp token is already used.": "ERR_WAPP_TOKEN_IN_USE"
};

export const resolveErrorMessage = err => {
  const rawError =
    typeof err === "string"
      ? err
      : err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "ERR_UNKNOWN";

  const errorMsg = LEGACY_ERROR_ALIASES[rawError] || rawError;

  if (/Número máximo de conexões/i.test(errorMsg)) {
    return i18n.t("backendErrors.ERR_WAPP_CONNECTION_LIMIT");
  }

  if (i18n.exists(`backendErrors.${errorMsg}`)) {
    return i18n.t(`backendErrors.${errorMsg}`);
  }

  if (MIGRATION_PENDING_PATTERN.test(errorMsg)) {
    return i18n.t("backendErrors.ERR_AI_MIGRATIONS_PENDING");
  }

  if (AI_PLATFORM_NOT_READY_PATTERN.test(errorMsg)) {
    return i18n.t("backendErrors.ERR_AI_PLATFORM_NOT_READY");
  }

  if (/timeout.*exceeded/i.test(errorMsg)) {
    return i18n.t("frontendErrors.ERR_API_SLOW");
  }

  if (errorMsg === "ERR_API_WARMING_UP") {
    return i18n.t("frontendErrors.ERR_BACKEND_NOT_READY");
  }

  if (API_WARMUP_ERRORS.has(errorMsg)) {
    return i18n.t("frontendErrors.ERR_BACKEND_NOT_READY");
  }

  return errorMsg;
};

const toastError = err => {
  const errorMsg = resolveErrorMessage(err);

  if (API_WARMUP_ERRORS.has(errorMsg)) {
    return;
  }

  if (
    typeof err !== "string" &&
    API_WARMUP_ERRORS.has(err?.response?.data?.error)
  ) {
    return;
  }

  if (errorMsg === "ERR_OTHER_OPEN_TICKET") {
    return "Já existe um atendimento aberto para este contato. Use a aba Aguardando ou Atendendo.";
  }

  if (
    typeof err !== "string" &&
    err?.response?.status === 403 &&
    /^Request failed with status code 403$/i.test(errorMsg)
  ) {
    return i18n.t("backendErrors.ERR_NO_PERMISSION");
  }

  if (
    typeof err !== "string" &&
    err?.response?.status === 409 &&
    /^Request failed with status code 409$/i.test(errorMsg)
  ) {
    return i18n.t("backendErrors.ERR_TICKET_ALREADY_ASSIGNED");
  }

  if (
    typeof err !== "string" &&
    err?.response?.status === 400 &&
    /^Request failed with status code 400$/i.test(errorMsg)
  ) {
    return "Não foi possível salvar. Verifique se o nome já existe, se o token está em uso ou se o limite de conexões foi atingido.";
  }

  if (
    typeof err !== "string" &&
    err?.response?.status === 500 &&
    /^Request failed with status code 500$/i.test(errorMsg)
  ) {
    return "Erro interno no servidor. Tente novamente ou contate o suporte.";
  }

  if (errorMsg) {
    const displayMsg =
      errorMsg === "Network Error"
        ? "Não foi possível conectar à API. Aguarde alguns segundos e tente novamente."
        : errorMsg;
    toast.error(displayMsg, {
      ...toastOptions,
      toastId: displayMsg
    });
    return;
  }

  if (isString(err)) {
    toast.error(err, toastOptions);
    return;
  }

  toast.error("An error occurred!", toastOptions);
};

export default toastError;
