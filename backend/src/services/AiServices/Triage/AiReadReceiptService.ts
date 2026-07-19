import Ticket from "../../../models/Ticket";
import Message from "../../../models/Message";
import GetTicketWbot from "../../../helpers/GetTicketWbot";
import { logger } from "../../../utils/logger";
import { isAiHandlingTicket, canAiEngageTicket } from "../AiHelpers";
import { resolveHandoffModeForTicket } from "./HandoffPolicyService";
import { getAiTriageConfig } from "./AiTriageConfigService";
import { isTriageV2EnabledForCompany } from "./AiTriageFeatureFlag";

export const shouldDeferWhatsAppReadReceipt = async (
  ticket: Ticket
): Promise<boolean> => {
  if (!(await isTriageV2EnabledForCompany(ticket.companyId))) {
    return false;
  }

  if (ticket.userId) {
    return false;
  }

  return (
    isAiHandlingTicket(ticket) ||
    resolveHandoffModeForTicket(ticket) === "operational"
  );
};

export const markInboundMessagesReadForAi = async (
  ticket: Ticket,
  messageId?: string
): Promise<void> => {
  const config = await getAiTriageConfig(ticket.companyId);
  if (!config.markReadWhenAiResponds) {
    return;
  }

  if (!(await isTriageV2EnabledForCompany(ticket.companyId))) {
    return;
  }

  if (
    !canAiEngageTicket(ticket) &&
    resolveHandoffModeForTicket(ticket) !== "operational"
  ) {
    return;
  }

  try {
    const wbot = await GetTicketWbot(ticket);
    if (!wbot) {
      return;
    }

    const where: Record<string, unknown> = {
      ticketId: ticket.id,
      fromMe: false,
      read: false
    };

    if (messageId) {
      where.id = messageId;
    }

    const messages = await Message.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: 20
    });

    for (const message of messages) {
      try {
        const dataJson = JSON.parse(message.dataJson || "{}");
        if (dataJson?.key) {
          await (wbot as any).readMessages([dataJson.key]);
        }
      } catch (error) {
        logger.debug(
          { error, messageId: message.id },
          "AI read receipt skipped"
        );
      }

      await message.update({
        read: true,
        aiReadAt: new Date()
      } as any);
    }
  } catch (error) {
    logger.warn(
      { error, ticketId: ticket.id },
      "Failed to mark AI read receipts"
    );
  }
};
