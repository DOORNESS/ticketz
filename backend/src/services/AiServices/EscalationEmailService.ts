import axios from "axios";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import AiEscalationEmail from "../../models/AiEscalationEmail";
import { logger } from "../../utils/logger";
import {
  buildEscalationFormUrl,
  createEscalationToken
} from "./EscalationEmailTokenService";
import {
  buildEscalationEmailHtml,
  buildEscalationTranscript
} from "./EscalationTranscriptService";
import { persistAiDecisionLog } from "./AiDecisionLogger";

const getResendApiKey = (): string => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("ERR_ESCALATION_EMAIL_NOT_CONFIGURED", 503);
  }
  return apiKey;
};

const getEscalationEmailFrom = (): string =>
  process.env.ESCALATION_EMAIL_FROM?.trim() || "aviso@emails.doorness.com";

const getEscalationEmailTo = (): string => {
  const configured = process.env.ESCALATION_EMAIL_TO?.trim();
  if (configured) {
    return configured;
  }
  return "fernandofortmax@gmail.com";
};

const isEscalationEmailEnabled = (): boolean =>
  process.env.ESCALATION_EMAIL_ENABLED !== "false";

export const sendTicketEscalationEmail = async ({
  ticket,
  requestedByUser,
  requestNotes
}: {
  ticket: Ticket;
  requestedByUser?: User | null;
  requestNotes?: string | null;
}): Promise<AiEscalationEmail> => {
  if (!isEscalationEmailEnabled()) {
    throw new AppError("ERR_ESCALATION_EMAIL_DISABLED", 503);
  }

  await ticket.reload({
    include: ["contact", "queue", "whatsapp"]
  });

  const escalation = await AiEscalationEmail.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    requestedByUserId: requestedByUser?.id || null,
    requestNotes: requestNotes?.trim() || null,
    status: "pending",
    emailTo: getEscalationEmailTo()
  });

  const token = createEscalationToken({
    escalationId: escalation.id,
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
  const formUrl = buildEscalationFormUrl(token);
  const transcript = await buildEscalationTranscript(ticket);
  const contactName = ticket.contact?.name || "Cliente";
  const contactNumber = ticket.contact?.number || "";
  const queueName = ticket.queue?.name || "Sem fila";
  const whatsappName = ticket.whatsapp?.name || "WhatsApp";
  const subject = `[Ticketz] Conserto solicitado — #${ticket.id} · ${contactName}`;

  const html = buildEscalationEmailHtml({
    ticket,
    contactName,
    contactNumber,
    queueName,
    whatsappName,
    requestNotes,
    requestedByName: requestedByUser?.name || null,
    transcriptHtml: transcript.htmlBody,
    formUrl
  });

  try {
    const response = await axios.post(
      "https://api.resend.com/emails",
      {
        from: getEscalationEmailFrom(),
        to: [getEscalationEmailTo()],
        subject,
        html,
        text: [
          `Solicitação de conserto — Ticket #${ticket.id}`,
          `Cliente: ${contactName} (${contactNumber})`,
          requestNotes?.trim() ? `Observação: ${requestNotes.trim()}` : "",
          "",
          "Registrar conserto:",
          formUrl,
          "",
          "Histórico:",
          transcript.plainText
        ]
          .filter(Boolean)
          .join("\n")
      },
      {
        headers: {
          Authorization: `Bearer ${getResendApiKey()}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    await escalation.update({
      status: "email_sent",
      emailSubject: subject,
      resendMessageId: response.data?.id || null
    });

    await persistAiDecisionLog({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      action: "investigate",
      reason: "manual_escalation_email",
      details: {
        escalationId: escalation.id,
        emailTo: getEscalationEmailTo(),
        requestedByUserId: requestedByUser?.id || null
      }
    });

    logger.info(
      {
        ticketId: ticket.id,
        companyId: ticket.companyId,
        escalationId: escalation.id,
        resendMessageId: response.data?.id
      },
      "Escalation email sent"
    );

    return escalation;
  } catch (error) {
    await escalation.update({ status: "failed" });
    logger.error(
      { error, ticketId: ticket.id, escalationId: escalation.id },
      "Failed to send escalation email"
    );
    throw new AppError("ERR_ESCALATION_EMAIL_SEND_FAILED", 502);
  }
};
