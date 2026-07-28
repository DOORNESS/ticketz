import Ticket from "../../models/Ticket";
import {
  isAiHandlingTicket,
  canAiEngageTicket,
  getActiveAgentForTicket
} from "./AiHelpers";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import {
  enqueueAiInboundMessage,
  getAiInboundQueue
} from "./AiInboundQueueService";
import { logger } from "../../utils/logger";

export type EngageAiInboundParams = {
  companyId: number;
  ticket: Ticket;
  messageBody: string;
  messageId?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaMimeType?: string;
  trigger?: string;
};

export const tryEngageAiOnInboundMessage = async ({
  companyId,
  ticket,
  messageBody,
  messageId,
  mediaType,
  mediaUrl,
  mediaFilename,
  mediaMimeType,
  trigger = "inbound_message"
}: EngageAiInboundParams): Promise<boolean> => {
  if (!isAiFeaturesEnabled()) {
    return false;
  }

  if (!canAiEngageTicket(ticket)) {
    if (ticket.aiHandoff) {
      logger.debug(
        { ticketId: ticket.id, trigger },
        "AI blocked after handoff — waiting for human"
      );
    }
    return false;
  }

  const activeAgent = await getActiveAgentForTicket(ticket);
  if (!activeAgent) {
    logger.warn(
      {
        ticketId: ticket.id,
        companyId,
        queueId: ticket.queueId,
        whatsappId: ticket.whatsappId,
        trigger
      },
      "No AI agent linked to ticket queue — inbound not handled by IA"
    );
    return false;
  }

  if (!ticket.aiStartedAt) {
    await ticket.update({
      aiStartedAt: new Date(),
      aiAgentId: activeAgent.id,
      chatbot: false
    });
    await ticket.reload();
  } else if (ticket.chatbot) {
    await ticket.update({
      chatbot: false
    });
    await ticket.reload();
  }

  const processingState = (ticket as { aiProcessingState?: string })
    .aiProcessingState;
  const queue = getAiInboundQueue();
  const redis = queue.client;
  const lockExists = await redis.exists(`ai:lock:${ticket.id}`);

  if (processingState === "processing" || lockExists) {
    const stalledMs = Date.now() - new Date(ticket.updatedAt).getTime();
    if (stalledMs > 20000) {
      await redis.del(`ai:lock:${ticket.id}`);
      await ticket.update({ aiProcessingState: "awaiting_customer" } as never);
      await ticket.reload();
      logger.warn(
        { ticketId: ticket.id, companyId, stalledMs },
        "Cleared stale AI lock/state before enqueue"
      );
    } else {
      logger.debug(
        { ticketId: ticket.id, companyId, trigger, processingState, lockExists },
        "AI job in progress — message buffered for follow-up"
      );
    }
  }

  const enqueued = await enqueueAiInboundMessage({
    companyId,
    ticketId: ticket.id,
    messageBody,
    messageId,
    mediaType,
    mediaUrl,
    mediaFilename,
    mediaMimeType
  });

  return enqueued;
};

export const tryEngageAiFromStoredMessage = async (
  ticket: Ticket,
  payload: {
    messageBody: string;
    messageId?: string;
    mediaType?: string;
    mediaUrl?: string;
    mediaFilename?: string;
  },
  trigger: string
): Promise<boolean> => {
  return tryEngageAiOnInboundMessage({
    companyId: ticket.companyId,
    ticket,
    messageBody: payload.messageBody,
    messageId: payload.messageId,
    mediaType: payload.mediaType,
    mediaUrl: payload.mediaUrl,
    mediaFilename: payload.mediaFilename,
    trigger
  });
};

export const shouldAiBypassLegacyBotMessages = async (
  ticket: Ticket,
  _companyId: number
): Promise<boolean> => {
  if (!isAiFeaturesEnabled()) {
    return false;
  }

  if (!canAiEngageTicket(ticket)) {
    return false;
  }

  const agent = await getActiveAgentForTicket(ticket);
  return !!agent && (canAiEngageTicket(ticket) || isAiHandlingTicket(ticket));
};
