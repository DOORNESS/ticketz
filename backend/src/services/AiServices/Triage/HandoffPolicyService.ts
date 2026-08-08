import Ticket from "../../../models/Ticket";
import { AI_HANDOFF_REASONS } from "../AiOperationalTypes";
import { detectHumanHandoffRequest, detectSensitiveTopic } from "../AiHelpers";
import { getAiScheduleContext } from "../AiScheduleContextService";
import { isTransientAiError } from "../isTransientAiError";
import {
  buildInvestigationQuestion,
  evaluateCaseCompleteness,
  shouldSkipSupportInvestigation,
  isVagueCustomerStatement,
  shouldBlockAutomaticHandoff
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
  snapshot: CaseCompletenessSnapshot,
  latestMessage = "",
  brandVocabulary: string[] = []
): HandoffPolicyDecision | null => {
  const investigationQuestion = buildInvestigationQuestion(
    snapshot,
    latestMessage,
    brandVocabulary
  );

  if (!investigationQuestion) {
    return null;
  }

  return {
    action: "investigate",
    handoffMode: "none",
    investigationQuestion
  };
};

/**
 * Investiga quando há pergunta útil a fazer; caso contrário, fica em silêncio.
 *
 * O corpo desta função era `{ action: "none" }` fixo, e `buildInvestigateDecision`
 * logo acima nunca era chamada. Ou seja: toda a triagem por investigação estava
 * inerte — `ProcessInboundMessageService` trata `action === "investigate"`, mas
 * nada nesta política jamais devolvia isso. O cliente mandava uma mensagem vaga
 * e a IA simplesmente não perguntava nada.
 *
 * O `|| { action: "none" }` preserva o comportamento antigo exatamente onde ele
 * fazia sentido: quando não existe boa pergunta, `buildInvestigationQuestion`
 * devolve null e nós calamos, em vez de inventar pergunta genérica.
 */
const investigateOrNone = (
  snapshot: CaseCompletenessSnapshot,
  latestMessage: string,
  brandVocabulary: string[] = []
): HandoffPolicyDecision =>
  buildInvestigateDecision(snapshot, latestMessage, brandVocabulary) || {
    action: "none",
    handoffMode: "none"
  };

const buildConfirmHandoffDecision = (
  schedule: Awaited<ReturnType<typeof getAiScheduleContext>>,
  handoffReason: keyof typeof AI_HANDOFF_REASONS
): HandoffPolicyDecision => ({
  action: "confirm_handoff",
  handoffMode: schedule.inBusinessHours ? "definitive" : "operational",
  handoffReason: AI_HANDOFF_REASONS[handoffReason],
  skipLegacyOutOfHours: true
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

  // Pedido explícito de humano decide antes de qualquer classificação.
  //
  // Estava depois de `shouldSkipSupportInvestigation`, e "Quero falar com um
  // atendente humano agora" casa TAMBÉM com `isInformationalIntent` — então o
  // pedido era engolido e o cliente ficava sem transferência nenhuma fora do
  // horário. Quem pede humano com todas as letras não está pedindo informação.
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

  if (shouldSkipSupportInvestigation(context.userText)) {
    return { action: "none", handoffMode: "none" };
  }

  if (detectSensitiveTopic(context.userText)) {
    return { action: "none", handoffMode: "none" };
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
      return investigateOrNone(snapshot, context.userText);
    }

    if (shouldBlockAutomaticHandoff(snapshot)) {
      return investigateOrNone(snapshot, context.userText);
    }

    return buildConfirmHandoffDecision(schedule, "provider_error");
  }

  if (
    context.proposedReason === AI_HANDOFF_REASONS.no_knowledge_found ||
    context.proposedReason === "no_knowledge_found"
  ) {
    if (snapshot.caseReadyForResolution) {
      return { action: "none", handoffMode: "none" };
    }

    if (
      snapshot.isVagueStatement ||
      snapshot.investigationRound < config.maxInvestigationRounds
    ) {
      return investigateOrNone(snapshot, context.userText);
    }

    if (
      shouldBlockAutomaticHandoff(snapshot) ||
      !snapshot.caseReadyForHandoff
    ) {
      return investigateOrNone(snapshot, context.userText);
    }

    return buildConfirmHandoffDecision(schedule, "no_knowledge_found");
  }

  if (
    context.proposedReason === AI_HANDOFF_REASONS.low_confidence ||
    context.proposedReason === "low_confidence"
  ) {
    if (snapshot.caseReadyForResolution) {
      return { action: "none", handoffMode: "none" };
    }

    if (
      isVagueCustomerStatement(context.userText) ||
      snapshot.investigationRound < config.maxInvestigationRounds
    ) {
      return investigateOrNone(snapshot, context.userText);
    }

    if ((context.confidenceScore || 0) >= config.minConfidenceForHandoff) {
      return { action: "none", handoffMode: "none" };
    }

    if (
      shouldBlockAutomaticHandoff(snapshot) ||
      !snapshot.caseReadyForHandoff
    ) {
      return investigateOrNone(snapshot, context.userText);
    }

    return buildConfirmHandoffDecision(schedule, "low_confidence");
  }

  if (snapshot.isVagueStatement) {
    return investigateOrNone(snapshot, context.userText);
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
