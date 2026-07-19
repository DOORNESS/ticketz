import Ticket from "../../../models/Ticket";
import { AI_HANDOFF_REASONS } from "../AiOperationalTypes";
import { detectHumanHandoffRequest, detectSensitiveTopic } from "../AiHelpers";
import { getAiScheduleContext } from "../AiScheduleContextService";
import { isTransientAiError } from "../isTransientAiError";
import {
  buildInvestigationQuestion,
  evaluateCaseCompleteness,
  isVagueCustomerStatement
} from "./CaseCompletenessEngine";
import { getAiTriageConfig } from "./AiTriageConfigService";
import {
  AiHandoffMode,
  CaseCompletenessSnapshot,
  HandoffPolicyDecision
} from "./AiTriageTypes";

export type HandoffEvaluationContext = {
  ticket: Ticket;
  userText: string;
  conversationText: string;
  proposedReason?: keyof typeof AI_HANDOFF_REASONS | string;
  forceHandoff?: boolean;
  providerError?: unknown;
  confidenceScore?: number;
  hasReliableContext?: boolean;
  hasReadyDocuments?: boolean;
  investigationRound?: number;
  hasMediaEvidence?: boolean;
};

const buildInvestigateDecision = (
  snapshot: CaseCompletenessSnapshot
): HandoffPolicyDecision => ({
  action: "investigate",
  handoffMode: "none",
  investigationQuestion: buildInvestigationQuestion(snapshot)
});

export const evaluateHandoffPolicy = async (
  context: HandoffEvaluationContext
): Promise<HandoffPolicyDecision> => {
  const config = await getAiTriageConfig(context.ticket.companyId);
  const schedule = await getAiScheduleContext(context.ticket);

  const snapshot = evaluateCaseCompleteness({
    latestMessage: context.userText,
    conversationText: context.conversationText,
    investigationRound:
      context.investigationRound ??
      Number((context.ticket as any).aiInvestigationRound || 0),
    hasMediaEvidence: context.hasMediaEvidence
  });

  if (detectSensitiveTopic(context.userText)) {
    return {
      action: schedule.inBusinessHours ? "definitive" : "operational",
      handoffMode: schedule.inBusinessHours ? "definitive" : "operational",
      handoffReason: AI_HANDOFF_REASONS.sensitive_subject,
      skipLegacyOutOfHours: true
    };
  }

  if (detectHumanHandoffRequest(context.userText) || context.forceHandoff) {
    if (
      !schedule.inBusinessHours &&
      config.blockDefinitiveHandoffOutsideHours
    ) {
      return {
        action: "operational",
        handoffMode: "operational",
        handoffReason: AI_HANDOFF_REASONS.customer_requested_human,
        skipLegacyOutOfHours: true
      };
    }

    return {
      action: "definitive",
      handoffMode: "definitive",
      handoffReason: AI_HANDOFF_REASONS.customer_requested_human
    };
  }

  if (context.providerError) {
    if (isTransientAiError(context.providerError)) {
      return {
        action: "none",
        handoffMode: "none",
        blockReason: "transient_provider_error"
      };
    }

    if (snapshot.investigationRound < config.maxInvestigationRounds) {
      return buildInvestigateDecision(snapshot);
    }

    return {
      action: schedule.inBusinessHours ? "definitive" : "operational",
      handoffMode: schedule.inBusinessHours ? "definitive" : "operational",
      handoffReason: AI_HANDOFF_REASONS.provider_error,
      skipLegacyOutOfHours: true
    };
  }

  if (
    context.proposedReason === AI_HANDOFF_REASONS.no_knowledge_found ||
    context.proposedReason === "no_knowledge_found"
  ) {
    if (
      snapshot.isVagueStatement ||
      snapshot.investigationRound < config.maxInvestigationRounds
    ) {
      return buildInvestigateDecision(snapshot);
    }

    if (!snapshot.caseReadyForHandoff) {
      return buildInvestigateDecision(snapshot);
    }

    return {
      action: schedule.inBusinessHours ? "definitive" : "operational",
      handoffMode: schedule.inBusinessHours ? "definitive" : "operational",
      handoffReason: AI_HANDOFF_REASONS.no_knowledge_found,
      skipLegacyOutOfHours: true
    };
  }

  if (
    context.proposedReason === AI_HANDOFF_REASONS.low_confidence ||
    context.proposedReason === "low_confidence"
  ) {
    if (
      isVagueCustomerStatement(context.userText) ||
      snapshot.investigationRound < config.maxInvestigationRounds
    ) {
      return buildInvestigateDecision(snapshot);
    }

    if ((context.confidenceScore || 0) >= config.minConfidenceForHandoff) {
      return { action: "none", handoffMode: "none" };
    }

    if (!snapshot.caseReadyForHandoff) {
      return buildInvestigateDecision(snapshot);
    }

    return {
      action: schedule.inBusinessHours ? "definitive" : "operational",
      handoffMode: schedule.inBusinessHours ? "definitive" : "operational",
      handoffReason: AI_HANDOFF_REASONS.low_confidence,
      skipLegacyOutOfHours: true
    };
  }

  if (snapshot.isVagueStatement) {
    return buildInvestigateDecision(snapshot);
  }

  return { action: "none", handoffMode: "none" };
};

export const resolveHandoffModeForTicket = (ticket: Ticket): AiHandoffMode => {
  const mode = (ticket as any).aiHandoffMode as AiHandoffMode | undefined;
  if (mode === "operational" || mode === "definitive") {
    return mode;
  }

  return ticket.aiHandoff ? "definitive" : "none";
};
