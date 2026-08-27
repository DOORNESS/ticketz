import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiConversationLog from "../../models/AiConversationLog";
import UpdateTicketService, {
  websocketUpdateTicket
} from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import { logger } from "../../utils/logger";
import ResolveHandoffQueueService from "./ResolveHandoffQueueService";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import {
  AI_HANDOFF_REASONS,
  AiHandoffReason,
  getHandoffReasonLabel
} from "./AiOperationalTypes";
import { logAiOperationalEvent } from "./AiOperationalLogService";
import { getIO } from "../../libs/socket";
import { generateHandoffSummary } from "./AiHandoffSummaryService";
import { classifyTicketPriority } from "./AiPriorityClassifierService";
import {
  AiHandoffMode,
  CaseCompletenessSnapshot
} from "./Triage/AiTriageTypes";
import { getAiScheduleContext } from "./AiScheduleContextService";
import {
  evaluateCaseCompleteness,
  shouldBlockAutomaticHandoff
} from "./Triage/CaseCompletenessEngine";
import { isTriageV2EnabledForCompany } from "./Triage/AiTriageFeatureFlag";
import { detectHumanHandoffRequest } from "./AiHelpers";
import {
  detectAgentBrand,
  buildNivelHumanSupportReply
} from "./AgentPersonaService";

type HandoffParams = {
  ticket: Ticket;
  agent: AiAgent;
  userMessage: string;
  messageId?: string;
  reason?: string;
  handoffReason?: AiHandoffReason;
  usedChunks?: unknown;
  model?: string;
  conversationText?: string;
  handoffMode?: AiHandoffMode;
  skipLegacyOutOfHours?: boolean;
  caseCompleteness?: CaseCompletenessSnapshot;
  handoffMessageOverride?: string;
  skipCustomerMessage?: boolean;
};

const normalizeHandoffReason = (
  reason?: string,
  handoffReason?: AiHandoffReason
): AiHandoffReason => {
  if (
    handoffReason &&
    Object.values(AI_HANDOFF_REASONS).includes(handoffReason)
  ) {
    return handoffReason;
  }

  if (reason?.includes("sensitive")) {
    return AI_HANDOFF_REASONS.sensitive_subject;
  }

  if (reason?.includes("confidence") || reason?.includes("low")) {
    return AI_HANDOFF_REASONS.low_confidence;
  }

  if (reason?.includes("knowledge") || reason?.includes("no_knowledge")) {
    return AI_HANDOFF_REASONS.no_knowledge_found;
  }

  if (reason?.includes("provider") || reason?.includes("error")) {
    return AI_HANDOFF_REASONS.provider_error;
  }

  if (
    reason?.includes("human") ||
    reason?.includes("handoff_requested") ||
    reason?.includes("customer")
  ) {
    return AI_HANDOFF_REASONS.customer_requested_human;
  }

  return AI_HANDOFF_REASONS.customer_requested_human;
};

const HandoffToHumanService = async ({
  ticket,
  agent,
  userMessage,
  messageId,
  reason,
  handoffReason,
  usedChunks,
  model,
  conversationText,
  handoffMode = "definitive",
  skipLegacyOutOfHours = false,
  caseCompleteness,
  handoffMessageOverride,
  skipCustomerMessage = false
}: HandoffParams): Promise<Ticket> => {
  const resolvedReason = normalizeHandoffReason(reason, handoffReason);
  const scheduleContext = await getAiScheduleContext(ticket);
  const explicitHumanRequest =
    resolvedReason === AI_HANDOFF_REASONS.customer_requested_human &&
    detectHumanHandoffRequest(userMessage);
  const isSensitive = resolvedReason === AI_HANDOFF_REASONS.sensitive_subject;

  if (await isTriageV2EnabledForCompany(ticket.companyId)) {
    const snapshot =
      caseCompleteness ||
      evaluateCaseCompleteness({
        latestMessage: userMessage,
        conversationText: conversationText || userMessage,
        investigationRound: Number((ticket as any).aiInvestigationRound || 0)
      });

    if (
      shouldBlockAutomaticHandoff(snapshot, {
        explicitHumanRequest,
        sensitive: isSensitive
      })
    ) {
      logger.warn(
        {
          ticketId: ticket.id,
          reason: resolvedReason,
          investigationRound: snapshot.investigationRound,
          isVagueStatement: snapshot.isVagueStatement
        },
        "Handoff blocked until case has enough diagnostic context"
      );
      throw new Error(
        `Handoff blocked: ticket ${ticket.id} needs more customer context before transfer`
      );
    }
  }

  const effectiveMode: AiHandoffMode = scheduleContext.inBusinessHours
    ? "definitive"
    : handoffMode === "operational"
      ? "operational"
      : "definitive";

  const routing = await ResolveHandoffQueueService({
    companyId: ticket.companyId,
    agent,
    conversationText: conversationText || userMessage,
    currentQueueId: ticket.queueId
  });

  const targetQueueId =
    routing.queueId > 0
      ? routing.queueId
      : agent.fallbackQueueId || ticket.queueId;

  if (!targetQueueId) {
    logger.error(
      { ticketId: ticket.id, routing },
      "Handoff blocked: no target queue resolved"
    );
    throw new Error(`Handoff blocked: ticket ${ticket.id} has no target queue`);
  }

  const handoffMessage =
    handoffMessageOverride?.trim() ||
    (explicitHumanRequest && detectAgentBrand(agent) === "nivel"
      ? buildNivelHumanSupportReply()
      : null) ||
    (effectiveMode === "operational" && !scheduleContext.inBusinessHours
      ? "Não consegui concluir esta solução com segurança. Nosso suporte humano atende de segunda a sexta-feira, das 08h às 17h. Seu atendimento já ficou registrado e será analisado no próximo período disponível. Enquanto isso, posso continuar coletando informações ou ajudar em outras dúvidas."
      : agent.handoffMessage?.trim() ||
        "Entendi. Para resolver isso com segurança, vou transferir seu atendimento para o setor responsável. Um atendente dará continuidade em instantes.");

  if (!skipCustomerMessage) {
    try {
      await SendWhatsAppMessage({
        body: formatBody(handoffMessage, ticket),
        ticket
      });
    } catch (error) {
      logger.error(
        { error, ticketId: ticket.id },
        "Failed to send handoff message"
      );
    }
  }

  const now = new Date();

  await UpdateTicketService({
    ticketId: ticket.id,
    companyId: ticket.companyId,
    ticketData: {
      aiHandoff: true,
      aiHandoffReason: resolvedReason,
      aiHandoffOriginalReason: ticket.aiHandoffOriginalReason || resolvedReason,
      aiHandoffMode: effectiveMode,
      aiPaused: effectiveMode === "definitive",
      chatbot: false,
      status: "pending",
      queueId: targetQueueId,
      aiAgentId: agent.id,
      aiHandoffAt: now,
      aiWaitingSince: now,
      aiSlaBreached: false,
      aiSlaEscalationLevel: 0,
      aiLastSlaAlertAt: null,
      aiSkipLegacyOutOfHoursOnHandoff: skipLegacyOutOfHours,
      aiCaseCompleteness: caseCompleteness || ticket.aiCaseCompleteness,
      aiProcessingState:
        effectiveMode === "operational" ? "awaiting_human" : "awaiting_human"
    } as any
  });

  const updatedTicket = await ticket.reload({
    include: ["contact", "queue", "whatsapp", "user"]
  });

  const handoffReasonLabel = getHandoffReasonLabel(resolvedReason);
  const summary = await generateHandoffSummary({
    ticket: updatedTicket,
    conversationText,
    handoffReasonLabel
  });
  const priority =
    updatedTicket.aiPriority || classifyTicketPriority(userMessage);

  await updatedTicket.update({
    aiHandoffSummary: summary,
    aiPriority: priority,
    aiEndedAt:
      effectiveMode === "definitive" ? new Date() : updatedTicket.aiEndedAt
  });
  await updatedTicket.reload({
    include: ["contact", "queue", "whatsapp", "user"]
  });

  websocketUpdateTicket(updatedTicket, [
    `queue-${targetQueueId}-handoff`,
    `queue-${targetQueueId}-notification`
  ]);

  const io = getIO();
  io.to(`queue-${targetQueueId}-handoff`)
    .to(`queue-${targetQueueId}-notification`)
    .to(`company-${ticket.companyId}-handoff`)
    .emit(`company-${ticket.companyId}-handoff`, {
      action: "handoff_alert",
      ticket: updatedTicket,
      reason: resolvedReason,
      reasonLabel: getHandoffReasonLabel(resolvedReason)
    });

  const decisionDetails = {
    handoffReason: resolvedReason,
    handoffReasonLabel: getHandoffReasonLabel(resolvedReason),
    routingMethod: routing.method,
    routingConfidence: routing.confidence,
    routingReason: routing.reason,
    targetQueueId,
    targetQueueName: routing.queueName,
    usedChunks: usedChunks || null
  };

  await AiConversationLog.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    messageId,
    direction: "outbound",
    userMessage,
    aiResponse: handoffMessage,
    usedChunks: decisionDetails,
    model: model || agent.textModel,
    transferredToHuman: true,
    error: resolvedReason
  });

  await persistAiDecisionLog({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    messageId,
    action: "handoff",
    reason: resolvedReason,
    details: decisionDetails,
    userMessage,
    aiResponse: handoffMessage,
    transferredToHuman: true
  });

  await logAiOperationalEvent({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    event: "ai_transferred",
    details: decisionDetails,
    messageId
  });

  await logAiOperationalEvent({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    event: "ticket_queued",
    details: {
      queueId: targetQueueId,
      queueName: routing.queueName,
      reason: resolvedReason
    },
    messageId
  });

  return updatedTicket;
};

export default HandoffToHumanService;
