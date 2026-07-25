"use strict";

import Whatsapp from "../../models/Whatsapp";
import BaileysKeys from "../../models/BaileysKeys";
import {
  getWbot,
  isWhatsAppSessionHealthy,
  removeWbot
} from "../../libs/wbot";
import {
  StartWhatsAppSession,
  isWhatsAppSessionStarting
} from "./StartWhatsAppSession";
import { ensureWbotMessageListener } from "./wbotMessageListener";
import { logger } from "../../utils/logger";

export const runWhatsAppSessionWatchdog = async (): Promise<void> => {
  const whatsapps = await Whatsapp.findAll();

  await Promise.all(
    whatsapps.map(async whatsapp => {
      if (whatsapp.status === "qrcode" && whatsapp.qrcode) {
        return;
      }

      if (
        whatsapp.status === "OPENING" ||
        isWhatsAppSessionStarting(whatsapp.id)
      ) {
        return;
      }

      const keyCount = await BaileysKeys.count({
        where: { whatsappId: whatsapp.id }
      });

      if (keyCount === 0) {
        return;
      }

      try {
        const wbot = getWbot(whatsapp.id);
        if (isWhatsAppSessionHealthy(wbot)) {
          ensureWbotMessageListener(wbot, whatsapp.companyId);
          return;
        }

        logger.warn(
          { whatsappId: whatsapp.id, status: whatsapp.status, keyCount },
          "WhatsApp session unhealthy — restarting"
        );
        await removeWbot(whatsapp.id, false);
      } catch {
        logger.warn(
          { whatsappId: whatsapp.id, status: whatsapp.status, keyCount },
          "WhatsApp session missing in memory — restarting"
        );
      }

      try {
        if (!["CONNECTED", "OPENING", "PENDING"].includes(whatsapp.status)) {
          await whatsapp.update({ status: "OPENING", qrcode: "" });
        }
        await StartWhatsAppSession(whatsapp, whatsapp.companyId, true);
      } catch (error) {
        logger.error(
          { error, whatsappId: whatsapp.id },
          "WhatsApp watchdog failed to restart session"
        );
      }
    })
  );
};
