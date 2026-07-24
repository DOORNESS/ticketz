import { Op } from "sequelize";
import { subMinutes } from "date-fns";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { getActiveAgentForTicket, canAiEngageTicket } from "./AiHelpers";
import { getAiInboundQueue } from "./AiInboundQueueService";
import { tryEngageAiFromStoredMessage } from "./AiReengagementService";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import { logger } from "../../utils/logger";

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isProactiveFollowUpEnabled = (): boolean =>
  process.env.AI_PROACTIVE_FOLLOWUP_ENABLED !== "false";

const getFollowUpMinutes = (): number =>
  parsePositiveInt(process.env.AI_PROACTIVE_FOLLOWUP_MINUTES, 5);

const proactiveKey = (ticketId: number): string => `ai:proactive:${ticketId}`;

export const runAiProactiveFollowUp = async (): Promise<void> => {
  if (!isAiFeaturesEnabled() || !isProactiveFollowUpEnabled()) {
    return;
  }

  const followUpMinutes = getFollowUpMinutes();
  const cutoff = subMinutes(new Date(), followUpMinutes);
  const redis = getAiInboundQueue().client;

  const tickets = await Ticket.findAll({
    where: {
      userId: null,
      status: { [Op.in]: ["pending", "open"] },
      isGroup: false
    },
    include: [
      {
        model: Contact,
        required: true,
        where: { disableBot: false }
      }
    ]
  });

  // eslint-disable-next-line no-restricted-syntax
  for (const ticket of tickets) {
    try {
      const lockTtlSeconds = followUpMinutes * 60 * 2;
      const lock = await redis.set(
        proactiveKey(ticket.id),
        "1",
        "EX",
        lockTtlSeconds,
        "NX"
      );

      if (lock !== "OK") {
        continue;
      }

      if (!canAiEngageTicket(ticket)) {
        await redis.del(proactiveKey(ticket.id));
        continue;
      }

      const agent = await getActiveAgentForTicket(ticket);
      if (!agent) {
        await redis.del(proactiveKey(ticket.id));
        continue;
      }

      const lastInbound = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: false
        },
        order: [["createdAt", "DESC"]]
      });

      if (!lastInbound || lastInbound.createdAt > cutoff) {
        await redis.del(proactiveKey(ticket.id));
        continue;
      }

      const replyAfterInbound = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: true,
          createdAt: { [Op.gt]: lastInbound.createdAt }
        }
      });

      if (replyAfterInbound) {
        await redis.del(proactiveKey(ticket.id));
        continue;
      }

      const hadHandoff = ticket.aiHandoff;
      const rawMediaUrl = lastInbound.getDataValue("mediaUrl");
      const engaged = await tryEngageAiFromStoredMessage(
        ticket,
        {
          messageBody: lastInbound.body || "",
          messageId: lastInbound.id,
          mediaType: lastInbound.mediaType || undefined,
          mediaUrl: rawMediaUrl || undefined,
          mediaFilename: rawMediaUrl?.split("/").pop()
        },
        "proactive_followup"
      );

      if (!engaged) {
        await redis.del(proactiveKey(ticket.id));
        continue;
      }

      await persistAiDecisionLog({
        companyId: ticket.companyId,
        ticketId: ticket.id,
        messageId: lastInbound.id,
        action: "enqueue",
        reason: "proactive_followup",
        details: {
          followUpMinutes,
          lastInboundAt: lastInbound.createdAt,
          hadHandoff
        },
        userMessage: lastInbound.body || undefined
      });

      logger.info(
        {
          ticketId: ticket.id,
          companyId: ticket.companyId,
          followUpMinutes
        },
        "AI proactive follow-up enqueued for unanswered ticket"
      );
    } catch (error) {
      await redis.del(proactiveKey(ticket.id));
      logger.error(
        { error, ticketId: ticket.id, companyId: ticket.companyId },
        "AI proactive follow-up failed for ticket"
      );
    }
  }
};
