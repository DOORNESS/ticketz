import Whatsapp from "../../models/Whatsapp";
import { getWbot, isWhatsAppSessionHealthy } from "../../libs/wbot";
import { logger } from "../../utils/logger";
import {
  StartWhatsAppSession,
  isWhatsAppSessionStarting
} from "./StartWhatsAppSession";
import { ensureWbotMessageListener } from "./wbotMessageListener";

export const StartAllWhatsAppsSessions = async (
  companyId: number
): Promise<void> => {
  try {
    const whatsapps = await Whatsapp.findAll({ where: { companyId } });
    if (whatsapps.length > 0) {
      whatsapps.forEach(whatsapp => {
        if (whatsapp.channel !== "whatsapp") {
          return;
        }

        if (whatsapp.status === "qrcode" && whatsapp.qrcode) {
          return;
        }

        if (isWhatsAppSessionStarting(whatsapp.id)) {
          return;
        }

        try {
          const wbot = getWbot(whatsapp.id);
          if (isWhatsAppSessionHealthy(wbot)) {
            ensureWbotMessageListener(wbot, companyId);
            return;
          }

          logger.warn(
            { whatsappId: whatsapp.id, status: whatsapp.status },
            "WhatsApp session in memory but unhealthy on startup — restarting"
          );
        } catch {
          // not in memory — start below
        }

        StartWhatsAppSession(whatsapp, companyId);
      });
    }
  } catch (e) {
    logger.error(
      { message: e.message, stack: e.stack },
      "Error starting WhatsApp sessions"
    );
  }
};
