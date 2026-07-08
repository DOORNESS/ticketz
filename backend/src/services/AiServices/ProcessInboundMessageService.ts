import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import MessageMediaFile from "../../models/MessageMediaFile";
import AiConversationLog from "../../models/AiConversationLog";
import { chatCompletion, analyzeImage, transcribeAudio } from "./ModelGateway";
import {
  getActiveAgent,
  getKnowledgeBaseIdsForAgent,
  detectHumanHandoffRequest,
  detectSensitiveTopic,
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
import { readMediaBuffer } from "../../helpers/mediaStorage";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { isTransientAiError } from "./isTransientAiError";
import { logger } from "../../utils/logger";
import { persistAiDecisionLog } from "./AiDecisionLogger";

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

const DEFAULT_SYSTEM_RULES = `
Você é o primeiro atendente virtual da Fortmax Sistemas. Mantenha conversa contínua: responda TODA mensagem do cliente.
Mensagens de áudio do cliente são transcritas automaticamente — trate o texto transcrito como a pergunta dela e responda normalmente.
Nunca diga que não entende áudio; se a transcrição vier vazia, peça para repetir ou enviar por texto.
Quando o cliente fizer uma pergunta objetiva, responda o fato na primeira frase (ex.: anos no mercado, produtos, o que a empresa faz).
Use a base de conhecimento abaixo como fonte principal — se o dado estiver lá, cite-o.
Não repita saudações genéricas se o cliente já fez uma pergunta; responda a pergunta.
Se faltar um detalhe, faça perguntas objetivas e continue ajudando — não encerre o atendimento.
NUNCA diga que vai transferir, encaminhar ou chamar especialista, a menos que o cliente peça atendente/humano explicitamente.
Nunca invente preços, prazos ou políticas que não estejam no contexto.
Responda em português do Brasil.
`;

const EMPTY_RESPONSE_FALLBACK =
  "Recebi sua mensagem. Pode me contar um pouco mais do que você precisa para eu ajudar melhor?";

const TRANSIENT_ERROR_FALLBACK =
  "Desculpe, tive uma instabilidade momentânea. Pode repetir sua pergunta?";

const EMPTY_INPUT_FALLBACK =
  "Recebi sua mensagem, mas não consegui entender o conteúdo. Pode enviar por texto ou tentar novamente?";

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
    messages.map(async message => {
      let messageText = message.messageBody?.trim() || "";
      const mediaBuffer = message.mediaUrl
        ? (await readMediaBuffer(message.mediaUrl, companyId)) || undefined
        : undefined;

      if (mediaBuffer && message.mediaType === "audio") {
        if (!messageText) {
          messageText = await transcribeAudio(
            companyId,
            mediaBuffer,
            message.mediaFilename || "audio.ogg",
            agent.transcriptionModel,
            agent.provider
          );
        }

        void (async () => {
          try {
            const upload = await StorageService.uploadBuffer(mediaBuffer, {
              companyId,
              ticketId: ticket.id,
              messageId: message.messageId,
              filename: message.mediaFilename || "audio.ogg",
              contentType: message.mediaMimeType,
              folder: "media/audio"
            });

            await MessageMediaFile.create({
              companyId,
              ticketId: ticket.id,
              messageId: message.messageId,
              mediaType: "audio",
              mimeType: message.mediaMimeType,
              originalFilename: message.mediaFilename,
              sizeBytes: upload.sizeBytes,
              storageProvider: upload.provider,
              storageKey: upload.key,
              bucket: upload.bucket,
              publicUrl: upload.publicUrl,
              hash: upload.hash,
              transcriptionText: messageText
            });
          } catch (error) {
            logger.warn(
              { error, messageId: message.messageId },
              "Deferred audio storage upload failed"
            );
          }
        })();

        return messageText;
      }

      if (mediaBuffer && message.mediaType === "image") {
        const upload = await StorageService.uploadBuffer(mediaBuffer, {
          companyId,
          ticketId: ticket.id,
          messageId: message.messageId,
          filename: message.mediaFilename || "image.jpg",
          contentType: message.mediaMimeType,
          folder: "media/images"
        });

        const imageUrl = upload.publicUrl.startsWith("http")
          ? upload.publicUrl
          : `${process.env.BACKEND_URL || "http://localhost:8080"}${upload.publicUrl}`;

        const visionSummary = await analyzeImage(
          companyId,
          imageUrl,
          agent.visionModel,
          undefined,
          agent.provider
        );

        await MessageMediaFile.create({
          companyId,
          ticketId: ticket.id,
          messageId: message.messageId,
          mediaType: "image",
          mimeType: message.mediaMimeType,
          originalFilename: message.mediaFilename,
          sizeBytes: upload.sizeBytes,
          storageProvider: upload.provider,
          storageKey: upload.key,
          bucket: upload.bucket,
          publicUrl: upload.publicUrl,
          hash: upload.hash,
          visionSummary
        });

        messageText = messageText
          ? `${messageText}\n\n[Imagem enviada pelo cliente]: ${visionSummary}`
          : `[Imagem enviada pelo cliente]: ${visionSummary}`;
      }

      return messageText;
    })
  );

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

  const agent =
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

  let userText = "";

  try {
    userText = await resolveInboundText({
      companyId,
      ticket,
      agent,
      messages
    });

    if (!userText) {
      await SendWhatsAppMessage({
        body: formatBody(EMPTY_INPUT_FALLBACK, ticket),
        ticket
      });

      await persistAiDecisionLog({
        companyId,
        ticketId: ticket.id,
        messageId: primaryMessageId,
        action: "respond",
        reason: "empty_inbound_text_fallback",
        userMessage: messages.map(item => item.messageBody).join(" "),
        aiResponse: EMPTY_INPUT_FALLBACK
      });
      return;
    }

    const conversationText = await buildConversationText(ticket.id, userText);

    if (
      forceHandoff ||
      detectHumanHandoffRequest(userText) ||
      detectSensitiveTopic(userText)
    ) {
      await HandoffToHumanService({
        ticket,
        agent,
        userMessage: maskSensitiveLog(userText),
        messageId: primaryMessageId,
        reason: handoffReason || "handoff_requested_or_sensitive",
        conversationText
      });
      return;
    }

    const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
      companyId,
      agent.id,
      ticket.queueId
    );

    const [scheduleContext, knowledgeContext, history] = await Promise.all([
      getAiScheduleContext(ticket),
      buildKnowledgeContextForQuery({
        companyId,
        knowledgeBaseIds,
        userText,
        provider: agent.provider
      }),
      buildConversationHistory(ticket.id, 6)
    ]);

    const schedulePrompt = buildAiSchedulePromptBlock(scheduleContext);
    const usedChunks = knowledgeContext.usedChunks;
    const contextBlock = knowledgeContext.contextBlock;
    const hasReliableContext =
      usedChunks.length > 0 && usedChunks[0].similarity >= 0.25;

    const contextHint = contextBlock
      ? contextBlock
      : knowledgeContext.hasReadyDocuments
        ? "Documentos existem na base, mas nenhum trecho foi recuperado. Responda com base no histórico e peça detalhes se necessário."
        : "Base de conhecimento ainda sem documentos prontos. Responda com cordialidade e peça detalhes.";
    const systemPrompt = [
      agent.basePrompt || "",
      DEFAULT_SYSTEM_RULES,
      schedulePrompt,
      `Base de conhecimento:\n${contextHint}`
    ]
      .filter(Boolean)
      .join("\n\n");

    const completion = await chatCompletion(companyId, {
      model: agent.textModel,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      providerId: agent.provider,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: "user", content: userText }
      ]
    });

    const aiResponse = completion.content?.trim();
    const outboundText = aiResponse || EMPTY_RESPONSE_FALLBACK;

    await SendWhatsAppMessage({
      body: formatBody(outboundText, ticket),
      ticket
    });

    await ticket.update({
      aiAgentId: agent.id,
      aiHandoff: false,
      chatbot: false
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
        hadEmptyModelResponse: !aiResponse,
        reingestedDocuments: knowledgeContext.reingestedDocuments
      },
      userMessage: maskSensitiveLog(userText),
      aiResponse: maskSensitiveLog(outboundText)
    });
  } catch (error) {
    if (isTransientAiError(error)) {
      throw error;
    }

    logger.error({ error, ticketId: ticket.id }, "AI processing failed");

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
