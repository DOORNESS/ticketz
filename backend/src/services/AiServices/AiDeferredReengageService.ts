import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { canAiEngageTicket, isAiHandlingTicket } from "./AiHelpers";
import { getAiInboundQueue } from "./AiInboundQueueService";
import { tryEngageAiFromStoredMessage } from "./AiReengagementService";
import { logger } from "../../utils/logger";

const pendingChecks = new Map<string, NodeJS.Timeout>();

const ticketNeedsAiReply = async (ticketId: number): Promise<boolean> => {
  const lastInbound = await Message.findOne({
    where: { ticketId, fromMe: false },
    order: [["createdAt", "DESC"]],
    attributes: ["id", "createdAt", "body"]
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

export const scheduleDeferredAiResponseCheck = ({
  companyId,
  ticketId,
  delayMs = 8000
}: {
  companyId: number;
  ticketId: number;
  delayMs?: number;
}): void => {
  const key = `${companyId}:${ticketId}`;
  const existing = pendingChecks.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    pendingChecks.delete(key);
    void (async () => {
      try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket || ticket.companyId !== companyId) {
          return;
        }

        if (!canAiEngageTicket(ticket) && !isAiHandlingTicket(ticket)) {
          return;
        }

        const needsReply = await ticketNeedsAiReply(ticketId);
        if (!needsReply) {
          return;
        }

        const redis = getAiInboundQueue().client;
        const lockKey = `ai:lock:${ticketId}`;
        if (await redis.exists(lockKey)) {
          await redis.del(lockKey);
        }

        if (
          (ticket as { aiProcessingState?: string }).aiProcessingState ===
          "processing"
        ) {
          await ticket.update({
            aiProcessingState: "awaiting_customer"
          } as never);
          await ticket.reload();
        }

        const lastMessage = await Message.findOne({
          where: { ticketId, fromMe: false },
          order: [["createdAt", "DESC"]],
          attributes: ["id", "body", "mediaType"]
        });

        if (
          !lastMessage?.body?.trim() &&
          !lastMessage?.getDataValue("mediaUrl")
        ) {
          return;
        }

        await tryEngageAiFromStoredMessage(
          ticket,
          {
            messageBody: lastMessage.body || "",
            messageId: lastMessage.id,
            mediaType: lastMessage.mediaType,
            mediaUrl: lastMessage.getDataValue("mediaUrl") as string | undefined
          },
          "deferred_reengage"
        );
      } catch (error) {
        logger.error(
          { error, ticketId, companyId },
          "Deferred AI re-engage failed"
        );
      }
    })();
  }, delayMs);

  pendingChecks.set(key, timeout);
};
