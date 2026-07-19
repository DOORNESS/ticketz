import crypto from "crypto";
import Ticket from "../../../models/Ticket";
import AiTicketTimelineEvent from "../../../models/AiTicketTimelineEvent";

export const ensureTicketCorrelationId = async (
  ticket: Ticket
): Promise<string> => {
  const existing = (ticket as any).aiCorrelationId as string | undefined;
  if (existing) {
    return existing;
  }

  const correlationId = crypto.randomUUID();
  await ticket.update({ aiCorrelationId: correlationId } as any);
  return correlationId;
};

export const logAiTicketTimelineEvent = async ({
  companyId,
  ticketId,
  eventType,
  stage,
  operation,
  correlationId,
  messageId,
  agentId,
  details,
  errorClass
}: {
  companyId: number;
  ticketId: number;
  eventType: string;
  stage?: string;
  operation?: string;
  correlationId?: string;
  messageId?: string;
  agentId?: number;
  details?: Record<string, unknown>;
  errorClass?: string;
}): Promise<void> => {
  try {
    await AiTicketTimelineEvent.create({
      companyId,
      ticketId,
      eventType,
      stage: stage || null,
      operation: operation || null,
      correlationId: correlationId || null,
      messageId: messageId || null,
      agentId: agentId || null,
      details: details || null,
      errorClass: errorClass || null
    });
  } catch {
    // Timeline must never break the main flow.
  }
};
