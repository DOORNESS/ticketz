import { toast } from "react-toastify";
import { i18n } from "../translate/i18n";
import { isString } from "lodash";

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

export const resolveErrorMessage = err => {
  const errorMsg =
    typeof err === "string"
      ? err
      : err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "ERR_UNKNOWN";

  if (i18n.exists(`backendErrors.${errorMsg}`)) {
    return i18n.t(`backendErrors.${errorMsg}`);
  }

  if (MIGRATION_PENDING_PATTERN.test(errorMsg)) {
    return i18n.t("backendErrors.ERR_AI_MIGRATIONS_PENDING");
  }

  if (AI_PLATFORM_NOT_READY_PATTERN.test(errorMsg)) {
    return i18n.t("backendErrors.ERR_AI_PLATFORM_NOT_READY");
  }

  return errorMsg;
};

const toastError = err => {
  const errorMsg = resolveErrorMessage(err);

  if (errorMsg) {
    toast.error(errorMsg, {
      ...toastOptions,
      toastId: errorMsg
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
