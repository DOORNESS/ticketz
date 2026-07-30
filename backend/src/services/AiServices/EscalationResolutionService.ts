import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import AiEscalationEmail from "../../models/AiEscalationEmail";
import { logger } from "../../utils/logger";
import { verifyEscalationToken } from "./EscalationEmailTokenService";
import {
  buildEscalationFormPageHtml,
  buildEscalationSuccessPageHtml
} from "./EscalationTranscriptService";
import { getActiveAgentForTicket, getSpecialtyPromptRules } from "./AiHelpers";
import { buildAiSystemPrompt } from "./AiPromptBuilder";
import { runToolLoop } from "./tools/ToolLoopService";
import { deliverAiReply } from "./sendAiWhatsAppReply";
import { persistAiDecisionLog } from "./AiDecisionLogger";
import { finalizeAiResponse } from "./Triage/TriageOrchestratorService";
import { isAiFeaturesEnabled } from "./AiPlatformState";
import { prepareCustomerFacingAiText } from "./prepareCustomerFacingAiText";
import ShowTicketService from "../TicketServices/ShowTicketService";

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
    .filter(message => Boolean(message.body?.trim()))
    .map(message => ({
      role: message.fromMe ? ("assistant" as const) : ("user" as const),
      content: message.body || ""
    }));
};

const prepareTicketForResolutionFollowUp = async (
  ticket: Ticket
): Promise<Ticket> => {
  const updates: Partial<Ticket> = {};

  if (ticket.status === "closed") {
    updates.status = "open";
  }

  if (ticket.aiHandoff) {
    updates.aiHandoff = false;
    updates.aiHandoffAt = null;
    updates.aiHandoffMode = null;
  }

  if (ticket.aiPaused) {
    updates.aiPaused = false;
  }

  if (Object.keys(updates).length) {
    await ticket.update(updates);
  }

  await ticket.update({
    aiProcessingState: "processing"
  } as never);

  return ticket.reload({ include: ["contact", "whatsapp", "queue"] });
};

export const runEscalationResolutionFollowUp = async ({
  escalation,
  humanGuidance
}: {
  escalation: AiEscalationEmail;
  humanGuidance: string;
}): Promise<void> => {
  if (!isAiFeaturesEnabled()) {
    throw new AppError("ERR_AI_FEATURES_DISABLED", 503);
  }

  const ticket = await ShowTicketService(
    escalation.ticketId,
    escalation.companyId
  );
  await prepareTicketForResolutionFollowUp(ticket);

  const agent = await getActiveAgentForTicket(ticket);
  if (!agent) {
    throw new AppError("ERR_NO_ACTIVE_AI_AGENT", 422);
  }

  if (!ticket.aiAgentId) {
    await ticket.update({ aiAgentId: agent.id });
    await ticket.reload();
  }

  const history = await buildConversationHistory(ticket.id, 8);
  const operationalRules = `
Orientação interna da equipe técnica (NÃO repita literalmente ao cliente):
${humanGuidance.trim()}

Sua tarefa agora:
- Envie UMA mensagem proativa ao cliente no WhatsApp.
- Informe de forma natural que o problema reportado foi corrigido pela equipe.
- Peça gentilmente para ele testar e confirmar se está tudo funcionando.
- Não mencione e-mail, formulário, desenvolvedor ou orientação interna.
- Não peça handoff humano nesta mensagem.
`.trim();

  const systemPrompt = buildAiSystemPrompt({
    agent,
    specialtyRules: getSpecialtyPromptRules(agent.specialty),
    operationalRules
  });

  const loopResult = await runToolLoop({
    companyId: ticket.companyId,
    agent,
    disableTools: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(item => ({ role: item.role, content: item.content })),
      {
        role: "user",
        content:
          "[Sistema interno] O conserto foi aplicado. Avise o cliente e peça para testar."
      }
    ],
    context: {
      companyId: ticket.companyId,
      aiAgentId: agent.id,
      ticketId: ticket.id,
      contactId: ticket.contactId,
      queueId: ticket.queueId,
      userText: humanGuidance,
      providerId: agent.provider
    }
  });

  const fallbackReply =
    "Oi! Passando para avisar que nossa equipe já corrigiu o problema que você reportou. Pode testar por favor e me dizer se está tudo funcionando direitinho?";
  const replyBody = prepareCustomerFacingAiText(
    loopResult.content?.trim() || fallbackReply,
    humanGuidance,
    agent
  );

  const delivered = await deliverAiReply(ticket, replyBody);
  if (!delivered) {
    throw new AppError("ERR_ESCALATION_WHATSAPP_DELIVERY_FAILED", 502);
  }

  await finalizeAiResponse(ticket);
  await ticket.update({ aiProcessingState: "awaiting_customer" } as never);

  await persistAiDecisionLog({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    action: "respond",
    reason: "human_guidance_applied",
    details: {
      escalationId: escalation.id,
      delivered
    }
  });

  logger.info(
    {
      ticketId: ticket.id,
      escalationId: escalation.id,
      companyId: ticket.companyId
    },
    "Escalation resolution follow-up sent to customer"
  );
};

export const loadEscalationForToken = async (
  token: string
): Promise<{
  escalation: AiEscalationEmail;
  ticket: Ticket;
}> => {
  const payload = verifyEscalationToken(token);
  const escalation = await AiEscalationEmail.findOne({
    where: {
      id: payload.eid,
      ticketId: payload.tid,
      companyId: payload.cid
    }
  });

  if (!escalation) {
    throw new AppError("ERR_ESCALATION_NOT_FOUND", 404);
  }

  const ticket = await ShowTicketService(payload.tid, payload.cid);
  return { escalation, ticket };
};

export const renderEscalationFormPage = async (
  token: string
): Promise<string> => {
  const { escalation, ticket } = await loadEscalationForToken(token);
  return buildEscalationFormPageHtml({
    ticketId: ticket.id,
    contactName: ticket.contact?.name || "Cliente",
    contactNumber: ticket.contact?.number || "",
    alreadyResolved: escalation.status === "resolved",
    token
  });
};

export const submitEscalationResolution = async ({
  token,
  humanGuidance,
  resolvedByEmail
}: {
  token: string;
  humanGuidance: string;
  resolvedByEmail?: string | null;
}): Promise<string> => {
  const guidance = humanGuidance?.trim();
  if (!guidance || guidance.length < 10) {
    return buildEscalationFormPageHtml({
      ticketId: 0,
      contactName: "",
      contactNumber: "",
      alreadyResolved: false,
      errorMessage:
        "Descreva o conserto com pelo menos 10 caracteres. Esse texto orienta a IA, não vai literalmente para o cliente.",
      token
    });
  }

  const { escalation, ticket } = await loadEscalationForToken(token);

  if (escalation.status === "resolved") {
    return buildEscalationSuccessPageHtml(ticket.id);
  }

  await escalation.update({
    humanGuidance: guidance,
    resolvedByEmail: resolvedByEmail?.trim() || null,
    resolvedAt: new Date(),
    status: "resolved"
  });

  try {
    await runEscalationResolutionFollowUp({
      escalation,
      humanGuidance: guidance
    });
  } catch (error) {
    await escalation.update({ status: "email_sent" });
    logger.error(
      { error, escalationId: escalation.id, ticketId: ticket.id },
      "Escalation resolution follow-up failed after form submit"
    );

    return buildEscalationFormPageHtml({
      ticketId: ticket.id,
      contactName: ticket.contact?.name || "Cliente",
      contactNumber: ticket.contact?.number || "",
      alreadyResolved: false,
      errorMessage:
        "A orientação foi salva, mas a IA não conseguiu avisar o cliente agora. Tente novamente em instantes.",
      token
    });
  }

  return buildEscalationSuccessPageHtml(ticket.id);
};
