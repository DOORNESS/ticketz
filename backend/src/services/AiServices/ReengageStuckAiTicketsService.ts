import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import {
  canAiEngageTicket,
  ensureTicketQueueFromWhatsapp,
  getActiveAgentForTicket
} from "./AiHelpers";
import { tryEngageAiFromStoredMessage } from "./AiReengagementService";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { logger } from "../../utils/logger";

export type ReengageStuckAiTicketsSummary = {
  companyId: number;
  scanned: number;
  engaged: number;
  skippedNoAgent: number;
  skippedNoMessage: number;
};

export const reengageStuckAiTicketsForCompany = async (
  companyId: number
): Promise<ReengageStuckAiTicketsSummary> => {
  const summary: ReengageStuckAiTicketsSummary = {
    companyId,
    scanned: 0,
    engaged: 0,
    skippedNoAgent: 0,
    skippedNoMessage: 0
  };

  if (!isAiFeaturesEnabled()) {
    return summary;
  }

  const tickets = await Ticket.findAll({
    where: {
      companyId,
      status: { [Op.in]: ["open", "pending"] },
      userId: { [Op.is]: null },
      aiAgentId: { [Op.is]: null },
      isGroup: false,
      aiHandoff: false,
      aiPaused: false
    },
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "disableBot"]
      }
    ],
    limit: 150,
    order: [["updatedAt", "DESC"]]
  });

  summary.scanned = tickets.length;

  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index];
    if (!canAiEngageTicket(ticket)) {
      continue;
    }

    await ensureTicketQueueFromWhatsapp(ticket);
    const agent = await getActiveAgentForTicket(ticket);

    if (!agent) {
      summary.skippedNoAgent += 1;
      continue;
    }

    const lastMessage = await Message.findOne({
      where: {
        ticketId: ticket.id,
        fromMe: false
      },
      order: [["createdAt", "DESC"]],
      attributes: ["id", "body", "mediaType"]
    });

    const mediaUrl = lastMessage?.getDataValue("mediaUrl") as
      | string
      | undefined;

    if (!lastMessage?.body?.trim() && !mediaUrl) {
      summary.skippedNoMessage += 1;
      continue;
    }

    const engaged = await tryEngageAiFromStoredMessage(
      ticket,
      {
        messageBody: lastMessage.body || "",
        messageId: lastMessage.id,
        mediaType: lastMessage.mediaType,
        mediaUrl
      },
      "startup_reengage"
    );

    if (engaged) {
      summary.engaged += 1;
    }
  }

  if (summary.engaged > 0) {
    logger.info(summary, "Re-engaged stuck AI tickets");
  }

  return summary;
};

export const reengageStuckAiTicketsForConfiguredCompanies =
  async (): Promise<void> => {
    const raw = process.env.WIRE_SUPPORT_LINES_COMPANY_IDS?.trim();
    const companyIds = raw
      ? raw
          .split(",")
          .map(value => Number(value.trim()))
          .filter(value => Number.isFinite(value) && value > 0)
      : [Number(process.env.WIRE_SUPPORT_LINES_COMPANY_ID || 1)];

    await Promise.all(
      companyIds.map(async companyId => {
        try {
          await reengageStuckAiTicketsForCompany(companyId);
        } catch (error) {
          logger.error(
            { error, companyId },
            "Failed to re-engage stuck AI tickets for company"
          );
        }
      })
    );
  };
