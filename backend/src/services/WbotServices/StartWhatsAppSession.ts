import {
  getWbot,
  initWASocket,
  isWhatsAppSessionHealthy,
  removeWbot
} from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import { ensureWbotMessageListener } from "./wbotMessageListener";
import wbotMonitor from "./wbotMonitor";
import { logger } from "../../utils/logger";
import { sendWhatsappUpdate } from "../WhatsappService/SocketSendWhatsappUpdate";

const DEFAULT_START_TIMEOUT_MS = 90 * 1000;
const openingSessions = new Map<number, Promise<void>>();

export const isWhatsAppSessionStarting = (whatsappId: number): boolean =>
  openingSessions.has(whatsappId);

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getStartTimeoutMs = (): number =>
  parsePositiveInt(
    process.env.WHATSAPP_START_TIMEOUT_MS,
    DEFAULT_START_TIMEOUT_MS
  );

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`WHATSAPP_START_TIMEOUT_${timeoutMs}MS`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
};

const markStartFailedIfStillOpening = async (
  whatsapp: Whatsapp,
  error: unknown
): Promise<void> => {
  await whatsapp.reload();

  if (whatsapp.status === "qrcode" && whatsapp.qrcode) {
    return;
  }

  if (!["OPENING", "PENDING"].includes(whatsapp.status)) {
    return;
  }

  logger.error(
    {
      error,
      whatsappId: whatsapp.id,
      status: whatsapp.status
    },
    "WhatsApp session start failed while opening"
  );

  await whatsapp.update({
    status: "DISCONNECTED",
    qrcode: ""
  });
  sendWhatsappUpdate(whatsapp);
};

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp,
  companyId: number,
  isRefresh = false
): Promise<void> => {
  const activeStart = openingSessions.get(whatsapp.id);
  if (activeStart) {
    logger.info(
      { whatsappId: whatsapp.id },
      "WhatsApp session start already in progress"
    );
    return activeStart;
  }

  if (!isRefresh && whatsapp.status === "CONNECTED") {
    try {
      const wbot = getWbot(whatsapp.id);
      if (isWhatsAppSessionHealthy(wbot)) {
        ensureWbotMessageListener(wbot, companyId);
        logger.info(
          { whatsappId: whatsapp.id },
          "WhatsApp session already connected — ensured message listener"
        );
        return;
      }

      logger.warn(
        { whatsappId: whatsapp.id },
        "WhatsApp session marked connected but socket unhealthy — restarting"
      );
      await removeWbot(whatsapp.id, false);
      await whatsapp.update({ status: "OPENING", qrcode: "" });
    } catch {
      // stale CONNECTED status — proceed with start
    }
  }

  const startPromise = (async (): Promise<void> => {
    await whatsapp.update({ status: "OPENING" });
    sendWhatsappUpdate(whatsapp);

    const initPromise = initWASocket(whatsapp, null, isRefresh);

    initPromise
      .then(wbot => {
        ensureWbotMessageListener(wbot, companyId);
        wbotMonitor(wbot, whatsapp, companyId);
      })
      .catch(async err => {
        await markStartFailedIfStillOpening(whatsapp, err);
      });

    try {
      await withTimeout(initPromise, getStartTimeoutMs());
    } catch (err) {
      await markStartFailedIfStillOpening(whatsapp, err);
    }
  })();

  openingSessions.set(whatsapp.id, startPromise);

  // The guard must be released by the *bounded* start (withTimeout), never by
  // initWASocket: Baileys can leave that promise pending forever, and a guard
  // that never clears makes isWhatsAppSessionStarting() permanently true. Both
  // recovery paths — the 5min watchdog and scheduleSessionRestart — bail out on
  // that flag, so the connection stays DISCONNECTED until the process restarts
  // and even the panel's reconnect button becomes a no-op.
  const releaseGuard = () => {
    openingSessions.delete(whatsapp.id);
  };
  startPromise.then(releaseGuard, releaseGuard);

  return startPromise;
};
