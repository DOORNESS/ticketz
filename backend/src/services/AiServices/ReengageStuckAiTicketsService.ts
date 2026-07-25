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
import { getAiInboundQueue } from "./AiInboundQueueService";
import { logger } from "../../utils/logger";

export type ReengageStuckAiTicketsSummary = {
  companyId: number;
  scanned: number;
  engaged: number;
  skippedNoAgent: number;
  skippedNoMessage: number;
  skippedAlreadyAnswered: number;
  clearedLocks: number;
};

const ticketNeedsAiReply = async (ticketId: number): Promise<boolean> => {
  const lastInbound = await Message.findOne({
    where: { ticketId, fromMe: false },
    order: [["createdAt", "DESC"]],
    attributes: ["id", "createdAt"]
  });

  if (!lastInbound) {
    return false;
  }

  const lastOutbound = await Message.findOne({
    where: { ticketId, fromMe: true },
    order: [["createdAt", "DESC"]],
    attributes: ["id", "createdAt"]
  });

  if (!lastOutbound) {
    return true;
  }

  return (
    new Date(lastInbound.createdAt).getTime() >
    new Date(lastOutbound.createdAt).getTime()
  );
};

export const reengageStuckAiTicketsForCompany = async (
  companyId: number
): Promise<ReengageStuckAiTicketsSummary> => {
  const summary: ReengageStuckAiTicketsSummary = {
    companyId,
    scanned: 0,
    engaged: 0,
    skippedNoAgent: 0,
    skippedNoMessage: 0,
    skippedAlreadyAnswered: 0,
    clearedLocks: 0
  };

  if (!isAiFeaturesEnabled()) {
    return summary;
  }

  const tickets = await Ticket.findAll({
    where: {
      companyId,
      status: { [Op.in]: ["open", "pending"] },
      userId: { [Op.is]: null },
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
  const redis = getAiInboundQueue().client;

  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index];
    if (!canAiEngageTicket(ticket)) {
      continue;
    }

    const needsReply = await ticketNeedsAiReply(ticket.id);
    if (!needsReply) {
      summary.skippedAlreadyAnswered += 1;
      continue;
    }

    const processingState = (ticket as { aiProcessingState?: string })
      .aiProcessingState;
    if (processingState === "processing") {
      await ticket.update({ aiProcessingState: "awaiting_customer" } as never);
    }

    const lockKey = `ai:lock:${ticket.id}`;
    if (await redis.exists(lockKey)) {
      await redis.del(lockKey);
      summary.clearedLocks += 1;
    }

    await ensureTicketQueueFromWhatsapp(ticket);
    const agent = await getActiveAgentForTicket(ticket);

    if (!agent) {
      summary.skippedNoAgent += 1;
      continue;
    }

    if (!ticket.aiAgentId) {
      await ticket.update({ aiAgentId: agent.id, chatbot: false });
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

  if (summary.engaged > 0 || summary.clearedLocks > 0) {
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
