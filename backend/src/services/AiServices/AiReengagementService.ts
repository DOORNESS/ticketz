import Ticket from "../../models/Ticket";
import {
  isAiHandlingTicket,
  canAiEngageTicket,
  getActiveAgentForTicket
} from "./AiHelpers";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { enqueueAiInboundMessage } from "./AiInboundQueueService";
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
