import AiConversationLog from "../../models/AiConversationLog";
import {
  AI_OPERATIONAL_EVENT_LABELS,
  AiOperationalEvent
} from "./AiOperationalTypes";

type LogOperationalEventParams = {
  companyId: number;
  ticketId: number;
  event: AiOperationalEvent;
  details?: Record<string, unknown>;
  userId?: number | null;
  messageId?: string;
};

export const logAiOperationalEvent = async ({
  companyId,
  ticketId,
  event,
  details = {},
  userId,
  messageId
}: LogOperationalEventParams): Promise<void> => {
  const label = AI_OPERATIONAL_EVENT_LABELS[event] || event;

  await AiConversationLog.create({
    companyId,
    ticketId,
    messageId: messageId || `op-${Date.now()}`,
    direction: "system",
    userMessage: label,
    aiResponse: `[${event}]`,
    usedChunks: {
      event,
      label,
      userId: userId || null,
      ...details
    },
    model: "operational-log",
    transferredToHuman: event === "ai_transferred"
  });
};
