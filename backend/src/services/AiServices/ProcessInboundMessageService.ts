import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import AiConversationLog from "../../models/AiConversationLog";
import { resolveInboundMessageText } from "./MediaInboundResolver";
import {
  getActiveAgent,
  getKnowledgeBaseIdsForAgent,
  getSpecialtyPromptRules,
  resolveSpecialistAgent,
  detectHumanHandoffRequest,
  detectSensitiveTopic,
  detectLowConfidenceResponse,
  detectCustomerResolution,
  canAiEngageTicket
} from "./AiHelpers";
import {
  buildAiSchedulePromptBlock,
  getAiScheduleContext
} from "./AiScheduleContextService";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import HandoffToHumanService from "./HandoffToHumanService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import StorageService from "../StorageService/StorageService";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { isOrchestratorEnabledForCompany } from "./AiOrchestratorFeatureFlag";
import { isTransientAiError } from "./isTransientAiError";
import { logger } from "../../utils/logger";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import { AI_HANDOFF_REASONS } from "./AiOperationalTypes";
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
import "./tools/registerPilotTools";
import crypto from "crypto";

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

const AUDIO_USER_FALLBACK =
  "Não consegui compreender este áudio. Poderia reenviá-lo ou escrever sua mensagem?";

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
  await StorageService.ensureReady(companyId);

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
    providedAgent || (await getActiveAgent(companyId, ticket.queueId));

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

  try {
    userText = await resolveInboundText({
      companyId,
      ticket,
      agent,
      messages
    });

    if (!userText || userText === "__AUDIO_TRANSCRIPTION_FAILED__") {
      await SendWhatsAppMessage({
        body: formatBody(AUDIO_USER_FALLBACK, ticket),
        ticket
      });

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

    const priority = classifyTicketPriority(userText);
    if (!ticket.aiPriority) {
      await ticket.update({ aiPriority: priority });
    }

    const conversationText = await buildConversationText(ticket.id, userText);

    if (
      forceHandoff ||
      detectHumanHandoffRequest(userText) ||
      detectSensitiveTopic(userText)
    ) {
      const resolvedHandoffReason = detectSensitiveTopic(userText)
        ? AI_HANDOFF_REASONS.sensitive_subject
        : detectHumanHandoffRequest(userText)
          ? AI_HANDOFF_REASONS.customer_requested_human
          : (handoffReason as any) ||
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
      return;
    }

    if (detectCustomerResolution(userText)) {
      await SendWhatsAppMessage({
        body: formatBody(
          "Fico feliz em ter ajudado! Se precisar de algo mais, é só chamar.",
          ticket
        ),
        ticket
      });

      await UpdateTicketService({
        ticketId: ticket.id,
        companyId,
        ticketData: {
          status: "closed",
          aiResolvedByAi: true,
          aiHandoff: false,
          aiEndedAt: new Date(),
          justClose: true
        } as any
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

    if (!providedAgent) {
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

    const orchestratorMode = await isOrchestratorEnabledForCompany(companyId);

    const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
      companyId,
      agent.id,
      ticket.queueId,
      { orchestratorMode }
    );

    const [
      scheduleContext,
      knowledgeContext,
      history,
      verifiedMemory,
      memoryEnabled,
      toolsEnabled
    ] = await Promise.all([
      getAiScheduleContext(ticket),
      buildKnowledgeContextForQuery({
        companyId,
        knowledgeBaseIds,
        userText,
        provider: agent.provider
      }),
      buildConversationHistory(ticket.id, 6),
      loadVerifiedMemoryForPrompt(companyId, ticket.contactId),
      isContactMemoryEnabledForCompany(companyId),
      isToolsEnabledForCompany(companyId)
    ]);

    const usedChunks = knowledgeContext.usedChunks;
    const contextBlock = knowledgeContext.contextBlock;
    const hasReliableContext =
      usedChunks.length > 0 && usedChunks[0].similarity >= 0.25;

    if (
      knowledgeContext.hasReadyDocuments &&
      !hasReliableContext &&
      userText.length > 20
    ) {
      await HandoffToHumanService({
        ticket,
        agent,
        userMessage: maskSensitiveLog(userText),
        messageId: primaryMessageId,
        handoffReason: AI_HANDOFF_REASONS.no_knowledge_found,
        reason: "no_knowledge_found",
        conversationText,
        usedChunks
      });
      return;
    }
    const contextHint = contextBlock
      ? contextBlock
      : knowledgeContext.hasReadyDocuments
        ? "Documentos existem na base, mas nenhum trecho foi recuperado. Responda com base no histórico e peça detalhes se necessário."
        : "Base de conhecimento ainda sem documentos prontos. Responda com cordialidade e peça detalhes.";

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
      agent,
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

    if (!aiResponse || detectLowConfidenceResponse(aiResponse)) {
      await HandoffToHumanService({
        ticket,
        agent,
        userMessage: maskSensitiveLog(userText),
        messageId: primaryMessageId,
        handoffReason: AI_HANDOFF_REASONS.low_confidence,
        reason: "low_confidence",
        conversationText,
        usedChunks,
        model: completion.model
      });
      return;
    }

    const outboundText = aiResponse;
    const confidence = computeConfidenceScore({
      topSimilarity: usedChunks[0]?.similarity || 0,
      hasReliableContext,
      responseLength: outboundText.length
    });

    const responseCost = estimateAiCostUsd(
      completion.model,
      completion.tokensInput || 0,
      completion.tokensOutput || 0
    );

    await SendWhatsAppMessage({
      body: formatBody(outboundText, ticket),
      ticket
    });

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
    if (isTransientAiError(error)) {
      throw error;
    }

    logger.error({ error, ticketId: ticket.id }, "AI processing failed");

    const agent =
      providedAgent || (await getActiveAgent(companyId, ticket.queueId));

    if (agent) {
      await HandoffToHumanService({
        ticket,
        agent,
        userMessage: maskSensitiveLog(userText),
        messageId: primaryMessageId,
        handoffReason: AI_HANDOFF_REASONS.provider_error,
        reason: "provider_error",
        conversationText: userText
      });
      return;
    }

    await SendWhatsAppMessage({
      body: formatBody(TRANSIENT_ERROR_FALLBACK, ticket),
      ticket
    });

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
  }
};

export default ProcessInboundMessageService;
