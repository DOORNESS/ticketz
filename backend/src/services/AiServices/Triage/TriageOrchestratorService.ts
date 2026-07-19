import Ticket from "../../../models/Ticket";
import HandoffToHumanService from "../HandoffToHumanService";
import SendWhatsAppMessage from "../../WbotServices/SendWhatsAppMessage";
import formatBody from "../../../helpers/Mustache";
import { AI_HANDOFF_REASONS } from "../AiOperationalTypes";
import { persistAiDecisionLog } from "../AiDecisionLogger";
import {
  evaluateCaseCompleteness,
  buildInvestigationQuestion
} from "./CaseCompletenessEngine";
import {
  evaluateHandoffPolicy,
  HandoffEvaluationContext
} from "./HandoffPolicyService";
import {
  ensureTicketCorrelationId,
  logAiTicketTimelineEvent
} from "./AiTicketTimelineService";
import { markInboundMessagesReadForAi } from "./AiReadReceiptService";
import { isTriageV2EnabledForCompany } from "./AiTriageFeatureFlag";
import {
  CaseCompletenessSnapshot,
  HandoffPolicyDecision
} from "./AiTriageTypes";
import AiAgent from "../../../models/AiAgent";

export const isTriageV2Active = isTriageV2EnabledForCompany;

export const buildCaseSnapshot = async ({
  ticket,
  userText,
  conversationText,
  hasMediaEvidence = false
}: {
  ticket: Ticket;
  userText: string;
  conversationText: string;
  hasMediaEvidence?: boolean;
}): Promise<CaseCompletenessSnapshot> => {
  const investigationRound = Number((ticket as any).aiInvestigationRound || 0);
  return evaluateCaseCompleteness({
    latestMessage: userText,
    conversationText,
    investigationRound,
    hasMediaEvidence
  });
};

export const persistCaseSnapshot = async (
  ticket: Ticket,
  snapshot: CaseCompletenessSnapshot
): Promise<void> => {
  await ticket.update({
    aiCaseCompleteness: snapshot,
    aiProcessingState: snapshot.isVagueStatement
      ? "awaiting_customer"
      : "processing"
  } as any);
};

export const sendInvestigationResponse = async ({
  ticket,
  agent,
  snapshot,
  messageId,
  companyId,
  userText
}: {
  ticket: Ticket;
  agent: AiAgent;
  snapshot: CaseCompletenessSnapshot;
  messageId?: string;
  companyId: number;
  userText: string;
}): Promise<void> => {
  const question =
    buildInvestigationQuestion(snapshot) ||
    "Pode me explicar um pouco mais sobre o que aconteceu?";

  await SendWhatsAppMessage({
    body: formatBody(question, ticket),
    ticket
  });

  await ticket.update({
    aiInvestigationRound: snapshot.investigationRound + 1,
    aiProcessingState: "awaiting_customer"
  } as any);

  await markInboundMessagesReadForAi(ticket, messageId);

  await persistAiDecisionLog({
    companyId,
    ticketId: ticket.id,
    messageId,
    action: "investigate",
    reason: "case_incomplete",
    userMessage: userText,
    aiResponse: question,
    details: { missingInformation: snapshot.missingInformation }
  });

  await logAiTicketTimelineEvent({
    companyId,
    ticketId: ticket.id,
    eventType: "investigation_question",
    stage: "triage",
    operation: "ask_clarification",
    messageId,
    agentId: agent.id,
    details: {
      missingInformation: snapshot.missingInformation,
      investigationRound: snapshot.investigationRound + 1
    }
  });
};

export const executeHandoffDecision = async ({
  ticket,
  agent,
  decision,
  userText,
  messageId,
  conversationText,
  usedChunks,
  model,
  caseSnapshot
}: {
  ticket: Ticket;
  agent: AiAgent;
  decision: HandoffPolicyDecision;
  userText: string;
  messageId?: string;
  conversationText?: string;
  usedChunks?: unknown;
  model?: string;
  caseSnapshot?: CaseCompletenessSnapshot;
}): Promise<void> => {
  if (
    decision.action === "none" ||
    decision.action === "investigate" ||
    !decision.handoffReason
  ) {
    return;
  }

  await HandoffToHumanService({
    ticket,
    agent,
    userMessage: userText,
    messageId,
    handoffReason: decision.handoffReason,
    reason: decision.handoffReason,
    conversationText,
    usedChunks,
    model,
    handoffMode: decision.handoffMode,
    skipLegacyOutOfHours: decision.skipLegacyOutOfHours,
    caseCompleteness: caseSnapshot
  });
};

export const evaluateTriageHandoff = async (
  context: HandoffEvaluationContext
): Promise<{
  decision: HandoffPolicyDecision;
  snapshot: CaseCompletenessSnapshot;
}> => {
  const snapshot = await buildCaseSnapshot({
    ticket: context.ticket,
    userText: context.userText,
    conversationText: context.conversationText,
    hasMediaEvidence: context.hasMediaEvidence
  });

  await persistCaseSnapshot(context.ticket, snapshot);

  const decision = await evaluateHandoffPolicy({
    ...context,
    investigationRound: snapshot.investigationRound
  });

  return { decision, snapshot };
};

export const bootstrapTriageContext = async (
  ticket: Ticket,
  messageId?: string
): Promise<string> => {
  const correlationId = await ensureTicketCorrelationId(ticket);
  await logAiTicketTimelineEvent({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    eventType: "message_received",
    stage: "inbound",
    operation: "process_start",
    correlationId,
    messageId
  });
  return correlationId;
};

export const finalizeAiResponse = async (
  ticket: Ticket,
  messageId?: string
): Promise<void> => {
  await markInboundMessagesReadForAi(ticket, messageId);
  await ticket.update({ aiProcessingState: "awaiting_customer" } as any);
};
