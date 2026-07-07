import AiConversationLog from "../../models/AiConversationLog";
import { logger } from "../../utils/logger";

export type AiDecisionAction =
  | "enqueue"
  | "enqueue_skipped"
  | "job_started"
  | "job_cancelled"
  | "job_failed"
  | "process_skipped"
  | "handoff"
  | "respond"
  | "no_response";

export type AiDecisionEntry = {
  action: AiDecisionAction;
  ticketId: number;
  companyId: number;
  messageId?: string;
  reason: string;
  details?: Record<string, unknown>;
};

export const logAiDecision = (entry: AiDecisionEntry): void => {
  logger.info(
    {
      aiDecision: true,
      action: entry.action,
      ticketId: entry.ticketId,
      companyId: entry.companyId,
      messageId: entry.messageId,
      reason: entry.reason,
      details: entry.details || {}
    },
    `AI decision: ${entry.action} — ${entry.reason}`
  );
};

export const persistAiDecisionLog = async ({
  companyId,
  ticketId,
  messageId,
  action,
  reason,
  details,
  userMessage,
  aiResponse,
  transferredToHuman = false
}: {
  companyId: number;
  ticketId: number;
  messageId?: string;
  action: AiDecisionAction;
  reason: string;
  details?: Record<string, unknown>;
  userMessage?: string;
  aiResponse?: string;
  transferredToHuman?: boolean;
}): Promise<void> => {
  logAiDecision({
    action,
    ticketId,
    companyId,
    messageId,
    reason,
    details
  });

  try {
    await AiConversationLog.create({
      companyId,
      ticketId,
      messageId,
      direction: "system",
      userMessage: userMessage || null,
      aiResponse: aiResponse || `[${action}] ${reason}`,
      usedChunks: details || null,
      model: "decision-log",
      transferredToHuman,
      error: reason
    });
  } catch (error) {
    logger.warn(
      { error, ticketId, action, reason },
      "Failed to persist AI decision log"
    );
  }
};
