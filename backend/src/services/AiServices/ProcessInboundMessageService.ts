import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiConversationLog from "../../models/AiConversationLog";
import { resolveInboundMessageText } from "./MediaInboundResolver";
import {
  resolveProcessingAgent,
  getKnowledgeBaseIdsForAgent,
  getSpecialtyPromptRules,
  resolveSpecialistAgent,
  detectHumanHandoffRequest,
  detectCustomerResolution,
  canAiEngageTicket,
  detectHandoffConfirmationAccept,
  detectHandoffConfirmationDecline,
  buildHandoffConfirmationQuestion
} from "./AiHelpers";
import {
  isWaitingForBotNudge,
  isPureGreetingMessage,
  isShortHelpRequest,
  isInformationalIntent
} from "./Triage/CaseCompletenessEngine";
import { resolveCustomerTurnText } from "./WhatsAppCustomerTurnResolver";
import { runWhatsAppAiTurn } from "./WhatsAppAiTurnService";
import {
  buildAiSchedulePromptBlock,
  getAiScheduleContext
} from "./AiScheduleContextService";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import HandoffToHumanService from "./HandoffToHumanService";
import { deliverAiReply, sendAiWhatsAppReply } from "./sendAiWhatsAppReply";
import StorageService from "../StorageService/StorageService";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { isOrchestratorEnabledForCompany } from "./AiOrchestratorFeatureFlag";
import { isTransientAiError } from "./isTransientAiError";
import { logger } from "../../utils/logger";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import { AI_HANDOFF_REASONS, AiHandoffReason } from "./AiOperationalTypes";
import { logAiOperationalEvent } from "./AiOperationalLogService";
import UpdateTicketService, {
  websocketUpdateTicket
} from "../TicketServices/UpdateTicketService";
import { classifyTicketPriority } from "./AiPriorityClassifierService";
import { computeConfidenceScore, estimateAiCostUsd } from "./AiMetricsHelper";
import { buildExplainability, persistAiReplayLog } from "./AiReplayService";
import { buildAiSystemPrompt } from "./AiPromptBuilder";
import {
  loadVerifiedMemoryForPrompt,
  touchMemoryLastUsed
} from "./ContactMemory/ContactAiMemoryService";
import { extractMemoryCandidates } from "./ContactMemory/ContactAiMemoryExtractor";
import { enqueuePersistContactMemory } from "./ContactMemory/AiContactMemoryQueueService";
import { isContactMemoryEnabledForCompany } from "./ContactMemory/AiContactMemoryFeatureFlag";
import { isToolsEnabledForCompany } from "./tools/AiToolsFeatureFlag";
import { runToolLoop } from "./tools/ToolLoopService";
import { chatCompletion } from "./ModelGateway";
import "./tools/registerPilotTools";
import crypto from "crypto";
import {
  evaluateTriageHandoff,
  executeHandoffDecision,
  finalizeAiResponse,
  isTriageV2Active,
  sendHandoffConfirmationRequest
} from "./Triage/TriageOrchestratorService";
import { HandoffPolicyDecision } from "./Triage/AiTriageTypes";
import { logAiTicketTimelineEvent } from "./Triage/AiTicketTimelineService";
import { prepareCustomerFacingAiText } from "./prepareCustomerFacingAiText";
import { responseMimicsHumanHandoff } from "./Triage/detectImpliedHandoffMessage";
import {
  resolveAgentExternalSupportReply,
  resolveAgentInformationalFallback
} from "./AgentPersonaService";
import { getRagMinimumSimilarity } from "./RagConfig";
import { buildContextualRetrievalQuery } from "./ContextualRetrievalQuery";

export type InboundMessageItem = {
  messageBody: string;
  messageId?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaMimeType?: string;
};

type ProcessInboundParams = {
  ticket: Ticket;
  companyId: number;
  messages: InboundMessageItem[];
  agent?: AiAgent;
  forceHandoff?: boolean;
  handoffReason?: string;
};

const TRANSIENT_ERROR_FALLBACK =
  "Desculpe, tive uma instabilidade momentânea. Pode repetir sua pergunta?";

const AI_CUSTOMER_FALLBACK =
  "Ainda não encontrei uma resposta completa na base. Pode me contar um pouco mais o que você precisa?";

const resolveEffectiveMaxTokens = (
  agent: AiAgent,
  informationalQuery: boolean
): number => {
  const configured = agent.maxTokens || 1024;
  if (!informationalQuery) {
    return configured;
  }

  return Math.min(
    4096,
    Math.max(configured, informationalQuery ? 2048 : configured)
  );
};

const AUDIO_USER_FALLBACK =
  "Não consegui compreender este áudio. Poderia reenviá-lo ou escrever sua mensagem?";

export const sendAiCustomerFallback = async ({
  ticket,
  companyId,
  messageId,
  reason,
  userText,
  body = AI_CUSTOMER_FALLBACK,
  markSent,
  skipDedupe = false
}: {
  ticket: Ticket;
  companyId: number;
  messageId?: string;
  reason: string;
  userText: string;
  body?: string;
  markSent?: () => void;
  skipDedupe?: boolean;
}): Promise<void> => {
  if (!skipDedupe) {
    try {
      const { getAiInboundQueue } = await import("./AiInboundQueueService");
      const redis = getAiInboundQueue().client;
      const dedupeKey = `ai:fallback:sent:${ticket.id}:${messageId || reason}`;
      const acquired = await redis.set(dedupeKey, "1", "EX", 180, "NX");
      if (acquired !== "OK") {
        return;
      }
    } catch (dedupeError) {
      logger.warn(
        { dedupeError, ticketId: ticket.id },
        "Fallback dedupe check failed; sending anyway"
      );
    }
  }

  let delivered = false;
  try {
    delivered = await deliverAiReply(ticket, body);
    if (delivered) {
      markSent?.();
    } else {
      logger.warn(
        { ticketId: ticket.id, reason },
        "AI customer fallback was not delivered to WhatsApp"
      );
    }
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id, reason },
      "AI customer fallback delivery failed"
    );
  } finally {
    try {
      await finalizeAiResponse(ticket, messageId);
    } catch (finalizeError) {
      logger.warn(
        { finalizeError, ticketId: ticket.id },
        "Failed to finalize AI state after customer fallback"
      );
    }
  }

  if (!delivered) {
    return;
  }

  await persistAiDecisionLog({
    companyId,
    ticketId: ticket.id,
    messageId,
    action: "respond",
    reason,
    userMessage: maskSensitiveLog(userText),
    aiResponse: body
  });
};

const buildConversationHistory = async (
  ticketId: number,
  limit = 8
): Promise<{ role: "user" | "assistant"; content: string }[]> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]],
    limit
  });

  return messages
    .reverse()
    .filter(msg => {
      if (!msg.fromMe) {
        return Boolean(msg.body?.trim());
      }

      const body = msg.body || "";
      if (
        body.includes("Protocolo:") &&
        body.toLowerCase().includes("suporte técnico")
      ) {
        return false;
      }

      if (body.toLowerCase().includes("vou transferir seu atendimento")) {
        return false;
      }

      return Boolean(body.trim());
    })
    .map(msg => ({
      role: msg.fromMe ? ("assistant" as const) : ("user" as const),
      content: msg.body || ""
    }))
    .filter(msg => msg.content.trim());
};

const maskSensitiveLog = (text: string): string => {
  return text
    .replace(/sk-[a-zA-Z0-9]+/g, "[MASKED_KEY]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[MASKED_CPF]")
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[MASKED_CNPJ]");
};

const resolveInboundText = async ({
  companyId,
  ticket,
  agent,
  messages
}: {
  companyId: number;
  ticket: Ticket;
  agent: AiAgent;
  messages: InboundMessageItem[];
}): Promise<string> => {
  const needsStorage = messages.some(
    message =>
      Boolean(message.mediaUrl) ||
      (message.mediaType &&
        !["text", "chat", "extendedTextMessage", "conversation"].includes(
          message.mediaType
        ))
  );

  if (needsStorage) {
    try {
      await StorageService.ensureReady(companyId);
    } catch (storageError) {
      logger.warn(
        { storageError, companyId, ticketId: ticket.id },
        "Storage not ready for inbound media — continuing with text body"
      );
    }
  }

  const resolvedParts = await Promise.all(
    messages.map(message =>
      resolveInboundMessageText({ companyId, ticket, agent, message })
    )
  );

  if (resolvedParts.includes("__AUDIO_TRANSCRIPTION_FAILED__")) {
    return "__AUDIO_TRANSCRIPTION_FAILED__";
  }

  return resolvedParts.filter(Boolean).join("\n\n");
};

const buildConversationText = async (
  ticketId: number,
  latestUserText: string
): Promise<string> => {
  const history = await buildConversationHistory(ticketId, 12);
  const lines = history.map(item => `${item.role}: ${item.content}`);
  lines.push(`user: ${latestUserText}`);
  return lines.join("\n");
};

const hasInboundMediaEvidence = (messages: InboundMessageItem[]): boolean =>
  messages.some(
    message =>
      message.mediaType &&
      !["text", "chat", "extendedTextMessage"].includes(message.mediaType)
  );

const applyTriageDecision = async ({
  companyId,
  ticket,
  agent,
  userText,
  conversationText,
  messageId,
  decision,
  snapshot,
  usedChunks,
  model
}: {
  companyId: number;
  ticket: Ticket;
  agent: AiAgent;
  userText: string;
  conversationText: string;
  messageId?: string;
  decision: HandoffPolicyDecision;
  snapshot: import("./Triage/AiTriageTypes").CaseCompletenessSnapshot;
  usedChunks?: unknown;
  model?: string;
}): Promise<boolean> => {
  if (decision.action === "none") {
    return false;
  }

  if (decision.action === "investigate") {
    return false;
  }

  if (decision.action === "confirm_handoff") {
    await sendHandoffConfirmationRequest({
      ticket,
      agent,
      decision,
      messageId,
      companyId,
      userText
    });
    return true;
  }

  await executeHandoffDecision({
    ticket,
    agent,
    decision,
    userText,
    messageId,
    conversationText,
    usedChunks,
    model,
    caseSnapshot: snapshot
  });
  return true;
};

const runTriageGate = async ({
  companyId,
  ticket,
  agent,
  userText,
  conversationText,
  messageId,
  messages,
  proposedReason,
  forceHandoff: forceHandoffFlag,
  providerError,
  confidenceScore,
  hasReliableContext,
  hasReadyDocuments
}: {
  companyId: number;
  ticket: Ticket;
  agent: AiAgent;
  userText: string;
  conversationText: string;
  messageId?: string;
  messages: InboundMessageItem[];
  proposedReason?: string;
  forceHandoff?: boolean;
  providerError?: unknown;
  confidenceScore?: number;
  hasReliableContext?: boolean;
  hasReadyDocuments?: boolean;
}): Promise<boolean> => {
  if (!(await isTriageV2Active(companyId))) {
    return false;
  }

  const { decision, snapshot } = await evaluateTriageHandoff({
    ticket,
    userText,
    conversationText,
    hasMediaEvidence: hasInboundMediaEvidence(messages),
    proposedReason,
    forceHandoff: forceHandoffFlag,
    providerError,
    confidenceScore,
    hasReliableContext,
    hasReadyDocuments
  });

  return applyTriageDecision({
    companyId,
    ticket,
    agent,
    userText,
    conversationText,
    messageId,
    decision,
    snapshot
  });
};

const ProcessInboundMessageService = async ({
  ticket,
  companyId,
  messages,
  agent: providedAgent,
  forceHandoff = false,
  handoffReason
}: ProcessInboundParams): Promise<void> => {
  const primaryMessageId = messages[messages.length - 1]?.messageId;

  if (!isAiFeaturesEnabled()) {
    await persistAiDecisionLog({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      action: "process_skipped",
      reason: "ai_features_disabled"
    });
    return;
  }

  await ticket.reload({ include: ["contact", "whatsapp", "queue"] });

  if (!canAiEngageTicket(ticket)) {
    await persistAiDecisionLog({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      action: "process_skipped",
      reason: "ticket_not_eligible_for_ai",
      details: {
        aiHandoff: ticket.aiHandoff,
        userId: ticket.userId,
        status: ticket.status,
        disableBot: ticket.contact?.disableBot || false
      }
    });
    return;
  }

  let agent =
    (await resolveProcessingAgent(ticket, providedAgent || null)) || null;

  if (!agent) {
    await persistAiDecisionLog({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      action: "process_skipped",
      reason: "no_active_agent"
    });
    return;
  }

  let routingMeta: Awaited<
    ReturnType<typeof resolveSpecialistAgent>
  >["routing"];

  let userText = "";
  const triageV2Enabled = await isTriageV2Active(companyId);
  let shouldFinalizeAiState = true;
  let customerReplySent = false;

  const markCustomerReply = (): void => {
    customerReplySent = true;
  };

  try {
    if (triageV2Enabled) {
      try {
        await ticket.update({ aiProcessingState: "processing" });
      } catch (triageBootstrapError) {
        logger.warn(
          { triageBootstrapError, ticketId: ticket.id },
          "Failed to set AI processing state — continuing"
        );
      }
    }

    userText = await resolveInboundText({
      companyId,
      ticket,
      agent,
      messages
    });

    if (!userText || userText === "__AUDIO_TRANSCRIPTION_FAILED__") {
      await sendAiWhatsAppReply({
        ticket,
        body: AUDIO_USER_FALLBACK
      });
      markCustomerReply();

      if (triageV2Enabled) {
        await logAiTicketTimelineEvent({
          companyId,
          ticketId: ticket.id,
          eventType: "transcription_failed",
          stage: "media",
          operation: "audio_transcription",
          messageId: primaryMessageId
        });
        await finalizeAiResponse(ticket, primaryMessageId);
      }

      await persistAiDecisionLog({
        companyId,
        ticketId: ticket.id,
        messageId: primaryMessageId,
        action: "respond",
        reason: "empty_inbound_text_fallback",
        userMessage: messages.map(item => item.messageBody).join(" "),
        aiResponse: AUDIO_USER_FALLBACK
      });
      return;
    }

    const textParts = userText
      .split(/\n\n+/)
      .map(part => part.trim())
      .filter(Boolean);

    userText = await resolveCustomerTurnText({
      ticketId: ticket.id,
      rawUserText: userText,
      messageParts: textParts
    });

    const priority = classifyTicketPriority(userText);
    if (!ticket.aiPriority) {
      await ticket.update({ aiPriority: priority });
    }

    const conversationText = await buildConversationText(ticket.id, userText);
    const informationalQuery = isInformationalIntent(userText);

    if (
      triageV2Enabled &&
      ticket.aiProcessingState === "awaiting_handoff_confirmation"
    ) {
      await ticket.reload();
      const pendingReason = ticket.aiHandoffOriginalReason;
      const pendingMode = ticket.aiHandoffMode as
        | "operational"
        | "definitive"
        | undefined;

      if (detectHandoffConfirmationAccept(userText)) {
        await executeHandoffDecision({
          ticket,
          agent,
          decision: {
            action:
              pendingMode === "operational" ? "operational" : "definitive",
            handoffMode: pendingMode || "definitive",
            handoffReason: pendingReason as AiHandoffReason,
            skipLegacyOutOfHours: true
          },
          userText,
          messageId: primaryMessageId,
          conversationText
        });
        markCustomerReply();
        return;
      }

      if (detectHandoffConfirmationDecline(userText)) {
        await ticket.update({
          aiProcessingState: "awaiting_customer",
          aiHandoffOriginalReason: null,
          aiInvestigationRound: 0
        });
        await sendAiWhatsAppReply({
          ticket,
          body: "Sem problemas! Me conte com mais detalhes o que você precisa que eu te ajudo da melhor forma possível."
        });
        markCustomerReply();
        await finalizeAiResponse(ticket, primaryMessageId);
        return;
      }

      await sendAiWhatsAppReply({
        ticket,
        body: buildHandoffConfirmationQuestion()
      });
      markCustomerReply();
      await finalizeAiResponse(ticket, primaryMessageId);
      return;
    }

    const useDirectWhatsAppTurn =
      !forceHandoff &&
      (informationalQuery ||
        isPureGreetingMessage(userText.trim()) ||
        isShortHelpRequest(userText) ||
        isWaitingForBotNudge(userText));

    if (useDirectWhatsAppTurn) {
      await runWhatsAppAiTurn({
        companyId,
        ticket,
        agent,
        userText,
        messageId: primaryMessageId,
        markSent: markCustomerReply
      });
      return;
    }

    const requestedHumanSupport = detectHumanHandoffRequest(userText);
    const externalSupportReply =
      !forceHandoff && requestedHumanSupport
        ? resolveAgentExternalSupportReply(agent, userText)
        : null;

    if (externalSupportReply) {
      await sendAiWhatsAppReply({
        ticket,
        body: externalSupportReply
      });
      await persistAiDecisionLog({
        companyId,
        ticketId: ticket.id,
        messageId: primaryMessageId,
        action: "respond",
        reason: "brand_external_support_protocol",
        userMessage: maskSensitiveLog(userText),
        aiResponse: externalSupportReply
      });
      markCustomerReply();
      await finalizeAiResponse(ticket, primaryMessageId);
      return;
    }

    if (forceHandoff || requestedHumanSupport) {
      const handledByTriage = await runTriageGate({
        companyId,
        ticket,
        agent,
        userText,
        conversationText,
        messageId: primaryMessageId,
        messages,
        forceHandoff
      });

      if (handledByTriage) {
        markCustomerReply();
        return;
      }

      const resolvedHandoffReason = requestedHumanSupport
        ? AI_HANDOFF_REASONS.customer_requested_human
        : (handoffReason as AiHandoffReason) ||
          AI_HANDOFF_REASONS.customer_requested_human;

      await HandoffToHumanService({
        ticket,
        agent,
        userMessage: maskSensitiveLog(userText),
        messageId: primaryMessageId,
        reason: handoffReason || "handoff_requested_or_sensitive",
        handoffReason: resolvedHandoffReason,
        conversationText
      });
      markCustomerReply();
      return;
    }

    if (detectCustomerResolution(userText)) {
      await sendAiWhatsAppReply({
        ticket,
        body: "Fico feliz em ter ajudado! Se precisar de algo mais, é só chamar."
      });
      markCustomerReply();

      await UpdateTicketService({
        ticketId: ticket.id,
        companyId,
        ticketData: {
          status: "closed",
          aiResolvedByAi: true,
          aiHandoff: false,
          aiEndedAt: new Date(),
          aiProcessingState: null,
          justClose: true
        }
      });

      await logAiOperationalEvent({
        companyId,
        ticketId: ticket.id,
        event: "ai_resolved",
        messageId: primaryMessageId,
        details: { trigger: "customer_resolution_keywords" }
      });

      await logAiOperationalEvent({
        companyId,
        ticketId: ticket.id,
        event: "ticket_closed_by_ai",
        messageId: primaryMessageId
      });
      return;
    }

    const orchestratorMode = await isOrchestratorEnabledForCompany(companyId);

    if (orchestratorMode) {
      const resolved = await resolveSpecialistAgent({
        companyId,
        ticket,
        userText,
        conversationSummary: conversationText,
        messageId: primaryMessageId
      });
      agent = resolved.agent;
      routingMeta = resolved.routing;
    }

    const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
      companyId,
      agent.id,
      ticket.queueId,
      { orchestratorMode }
    );
    const history = await buildConversationHistory(ticket.id, 6);
    const retrievalQuery = buildContextualRetrievalQuery(userText, history);

    const [
      scheduleContext,
      knowledgeContext,
      verifiedMemory,
      memoryEnabled,
      toolsEnabled
    ] = await Promise.all([
      getAiScheduleContext(ticket),
      buildKnowledgeContextForQuery({
        companyId,
        knowledgeBaseIds,
        userText: retrievalQuery,
        provider: agent.provider,
        loadStrategy: "auto"
      }),
      loadVerifiedMemoryForPrompt(companyId, ticket.contactId),
      isContactMemoryEnabledForCompany(companyId),
      isToolsEnabledForCompany(companyId)
    ]);

    const usedChunks = knowledgeContext.usedChunks;
    const contextBlock = knowledgeContext.contextBlock;
    const hasReliableContext =
      usedChunks.length > 0 &&
      usedChunks[0].similarity >= getRagMinimumSimilarity();

    const contextHint = contextBlock
      ? contextBlock
      : knowledgeContext.hasReadyDocuments
        ? informationalQuery
          ? "Documentos existem na base, mas nenhum trecho atingiu relevância suficiente para esta pergunta. Não invente fatos; peça um detalhe objetivo para refazer a busca."
          : "Documentos existem na base, mas nenhum trecho relevante foi recuperado para esta pergunta. Não invente fatos. Continue a conversa com empatia e use a base; faça no máximo uma pergunta objetiva se faltar um detalhe essencial."
        : "A base de conhecimento ainda não tem documentos publicados para este tema. Não invente políticas, preços, contatos ou procedimentos. Seja cordial e peça um detalhe se necessário.";

    const effectiveMaxTokens = resolveEffectiveMaxTokens(
      agent,
      informationalQuery
    );
    const agentForCompletion =
      effectiveMaxTokens === agent.maxTokens
        ? agent
        : Object.assign(Object.create(Object.getPrototypeOf(agent)), agent, {
            maxTokens: effectiveMaxTokens
          });

    const systemPrompt = buildAiSystemPrompt({
      agent,
      specialtyRules: getSpecialtyPromptRules(agent.specialty),
      schedulePrompt: buildAiSchedulePromptBlock(scheduleContext),
      knowledgeContextBlock: contextHint,
      verifiedMemory,
      toolsEnabled
    });

    const requestStartedAt = Date.now();

    const loopResult = await runToolLoop({
      companyId,
      agent: agentForCompletion,
      disableTools: informationalQuery,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: "user", content: userText }
      ],
      context: {
        companyId,
        aiAgentId: agent.id,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        queueId: ticket.queueId,
        userId: ticket.userId,
        userText,
        conversationText,
        knowledgeBaseIds,
        providerId: agent.provider
      }
    });

    if (loopResult.handoffTriggered) {
      await persistAiDecisionLog({
        companyId,
        ticketId: ticket.id,
        messageId: primaryMessageId,
        action: "handoff",
        reason: "tool_handoff",
        userMessage: maskSensitiveLog(userText)
      });
      if (!customerReplySent) {
        await sendAiCustomerFallback({
          ticket,
          companyId,
          messageId: primaryMessageId,
          reason: "tool_handoff_without_reply",
          userText,
          body: AI_CUSTOMER_FALLBACK,
          markSent: markCustomerReply
        });
      } else {
        await finalizeAiResponse(ticket, primaryMessageId);
      }
      return;
    }

    const latencyMs = Date.now() - requestStartedAt;

    const aiResponse = loopResult.content?.trim();
    const completion = {
      content: loopResult.content,
      tokensInput: loopResult.tokensInput,
      tokensOutput: loopResult.tokensOutput,
      model: loopResult.model
    };

    const rejectModelResponse = !aiResponse || aiResponse.trim().length < 12;

    if (rejectModelResponse) {
      await sendAiCustomerFallback({
        ticket,
        companyId,
        messageId: primaryMessageId,
        reason: informationalQuery
          ? "informational_low_confidence_fallback"
          : "low_confidence_fallback",
        userText,
        body: informationalQuery
          ? resolveAgentInformationalFallback(agent, userText)
          : AI_CUSTOMER_FALLBACK,
        markSent: markCustomerReply
      });
      return;
    }

    const outboundText = prepareCustomerFacingAiText(
      aiResponse,
      userText,
      agent
    );
    if (!outboundText) {
      await sendAiCustomerFallback({
        ticket,
        companyId,
        messageId: primaryMessageId,
        reason: "empty_sanitized_response",
        userText,
        body: informationalQuery
          ? resolveAgentInformationalFallback(agent, userText)
          : AI_CUSTOMER_FALLBACK,
        markSent: markCustomerReply
      });
      return;
    }

    const confidence = computeConfidenceScore({
      topSimilarity: usedChunks[0]?.similarity || 0,
      hasReliableContext,
      responseLength: outboundText.length
    });

    await ticket.reload({ include: ["contact", "queue", "whatsapp", "user"] });

    if (
      responseMimicsHumanHandoff(outboundText) &&
      !ticket.aiHandoff &&
      !ticket.userId
    ) {
      await HandoffToHumanService({
        ticket,
        agent,
        userMessage: maskSensitiveLog(userText),
        messageId: primaryMessageId,
        handoffReason: AI_HANDOFF_REASONS.low_confidence,
        reason: "implied_handoff_message",
        conversationText,
        usedChunks,
        model: completion.model,
        handoffMessageOverride: outboundText,
        skipCustomerMessage: true
      });

      await deliverAiReply(ticket, outboundText);
      markCustomerReply();

      return;
    }

    const responseCost = estimateAiCostUsd(
      completion.model,
      completion.tokensInput || 0,
      completion.tokensOutput || 0
    );

    await deliverAiReply(ticket, outboundText);
    markCustomerReply();

    await finalizeAiResponse(ticket, primaryMessageId);

    if (!ticket.aiStartedAt) {
      await logAiOperationalEvent({
        companyId,
        ticketId: ticket.id,
        event: "ai_started",
        messageId: primaryMessageId
      });
    }

    const explainability = buildExplainability({
      confidence,
      usedChunks: usedChunks.map(chunk => ({
        documentTitle: chunk.documentTitle,
        topic: chunk.documentTitle,
        similarity: chunk.similarity
      })),
      extraSources: ["Histórico do cliente"]
    });

    await ticket.update({
      aiAgentId: agent.id,
      aiHandoff: false,
      aiPaused: false,
      chatbot: false,
      aiStartedAt: ticket.aiStartedAt || new Date(),
      aiLastConfidence: confidence,
      aiLastExplainability: explainability,
      aiResponseCount: (ticket.aiResponseCount || 0) + 1,
      aiTotalTokensInput:
        (ticket.aiTotalTokensInput || 0) + (completion.tokensInput || 0),
      aiTotalTokensOutput:
        (ticket.aiTotalTokensOutput || 0) + (completion.tokensOutput || 0),
      aiEstimatedCostUsd: Number(ticket.aiEstimatedCostUsd || 0) + responseCost
    });

    await ticket.reload({ include: ["contact", "queue", "whatsapp", "user"] });
    websocketUpdateTicket(ticket);

    await logAiOperationalEvent({
      companyId,
      ticketId: ticket.id,
      event: "ai_responded",
      messageId: primaryMessageId,
      details: {
        hasReliableContext,
        chunksUsed: usedChunks.length,
        confidence
      }
    });

    await AiConversationLog.create({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      direction: "outbound",
      userMessage: maskSensitiveLog(userText),
      aiResponse: maskSensitiveLog(outboundText),
      usedChunks,
      model: completion.model,
      tokensInput: completion.tokensInput,
      tokensOutput: completion.tokensOutput,
      transferredToHuman: false
    });

    await persistAiDecisionLog({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      action: "respond",
      reason: aiResponse ? "ai_response_sent" : "empty_ai_response_fallback",
      details: {
        hasReliableContext,
        chunksUsed: usedChunks.length,
        topSimilarity: usedChunks[0]?.similarity || 0,
        confidence,
        hadEmptyModelResponse: !aiResponse,
        reingestedDocuments: knowledgeContext.reingestedDocuments,
        routingLogId: routingMeta?.routingLogId,
        selectedSpecialty: agent.specialty,
        orchestratorConfidence: routingMeta?.confidence,
        orchestratorFallbackUsed: routingMeta?.fallbackUsed
      },
      userMessage: maskSensitiveLog(userText),
      aiResponse: maskSensitiveLog(outboundText)
    });

    await persistAiReplayLog({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      userQuestion: maskSensitiveLog(userText),
      conversationHistory: history,
      systemPrompt,
      usedChunks,
      aiResponse: maskSensitiveLog(outboundText),
      confidence,
      explainability,
      tokensInput: completion.tokensInput,
      tokensOutput: completion.tokensOutput,
      latencyMs,
      model: completion.model
    });

    if (memoryEnabled && ticket.contactId) {
      const candidates = extractMemoryCandidates({
        userText,
        aiResponse: outboundText,
        conversationText
      });

      if (candidates.length) {
        const idempotencyKey = crypto
          .createHash("sha256")
          .update(
            [
              companyId,
              ticket.contactId,
              ticket.id,
              primaryMessageId || "",
              JSON.stringify(candidates.map(item => item.key))
            ].join("|")
          )
          .digest("hex")
          .slice(0, 64);

        await enqueuePersistContactMemory({
          companyId,
          contactId: ticket.contactId,
          ticketId: ticket.id,
          messageId: primaryMessageId,
          aiAgentId: agent.id,
          candidates,
          idempotencyKey
        });
      }

      await touchMemoryLastUsed(companyId, ticket.contactId);
    }
  } catch (error) {
    if (customerReplySent) {
      logger.error(
        {
          error,
          ticketId: ticket.id,
          companyId,
          messageId: primaryMessageId,
          step: "post_delivery"
        },
        "AI post-delivery processing failed; duplicate recovery suppressed"
      );
      return;
    }

    if (isTransientAiError(error)) {
      throw error;
    }

    logger.error({ error, ticketId: ticket.id }, "AI processing failed");

    const agent =
      (await resolveProcessingAgent(ticket, providedAgent || null)) || null;

    if (agent && userText) {
      try {
        const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
          companyId,
          agent.id,
          ticket.queueId
        );
        const knowledgeContext = await buildKnowledgeContextForQuery({
          companyId,
          knowledgeBaseIds,
          userText,
          provider: agent.provider,
          loadStrategy: "auto"
        });
        const recovery = await chatCompletion(companyId, {
          model: agent.textModel,
          temperature: 0.3,
          maxTokens: Math.min(2048, agent.maxTokens || 1024),
          providerId: agent.provider,
          messages: [
            {
              role: "system",
              content: buildAiSystemPrompt({
                agent,
                knowledgeContextBlock:
                  knowledgeContext.contextBlock || "sem contexto"
              })
            },
            {
              role: "user",
              content: userText
            }
          ]
        });
        const recoveryText = prepareCustomerFacingAiText(
          recovery.content?.trim() || "",
          userText,
          agent
        );
        if (recoveryText.length >= 20) {
          await deliverAiReply(ticket, recoveryText);
          markCustomerReply();
          await finalizeAiResponse(ticket, primaryMessageId);
          await persistAiDecisionLog({
            companyId,
            ticketId: ticket.id,
            messageId: primaryMessageId,
            action: "respond",
            reason: "processing_error_recovery_reply",
            userMessage: maskSensitiveLog(userText),
            aiResponse: recoveryText
          });
          return;
        }
      } catch (recoveryError) {
        logger.warn(
          { recoveryError, ticketId: ticket.id },
          "AI recovery reply after processing error also failed"
        );
      }

      await sendAiCustomerFallback({
        ticket,
        companyId,
        messageId: primaryMessageId,
        reason: "processing_error_fallback",
        userText,
        body: TRANSIENT_ERROR_FALLBACK,
        markSent: markCustomerReply
      });
      return;
    }

    await deliverAiReply(ticket, TRANSIENT_ERROR_FALLBACK);
    markCustomerReply();

    await persistAiDecisionLog({
      companyId,
      ticketId: ticket.id,
      messageId: primaryMessageId,
      action: "respond",
      reason: "processing_error_fallback",
      details: {
        error: error instanceof Error ? error.message : String(error),
        forceHandoff
      },
      userMessage: maskSensitiveLog(userText),
      aiResponse: TRANSIENT_ERROR_FALLBACK
    });
  } finally {
    if (!customerReplySent && userText?.trim()) {
      try {
        await sendAiCustomerFallback({
          ticket,
          companyId,
          messageId: primaryMessageId,
          reason: "mandatory_reply_guard",
          userText,
          body: isInformationalIntent(userText)
            ? resolveAgentInformationalFallback(agent, userText)
            : AI_CUSTOMER_FALLBACK,
          skipDedupe: true,
          markSent: markCustomerReply
        });
      } catch (guardError) {
        logger.error(
          { guardError, ticketId: ticket.id },
          "Mandatory reply guard failed — customer may see silence"
        );
      }
    }

    if (shouldFinalizeAiState) {
      try {
        await ticket.reload();
        if (ticket.aiProcessingState === "processing") {
          await finalizeAiResponse(ticket, primaryMessageId);
        }
      } catch (finalizeError) {
        logger.warn(
          { finalizeError, ticketId: ticket.id },
          "Failed to finalize AI processing state"
        );
      }
    }
  }
};

export default ProcessInboundMessageService;
