/* eslint-disable import/no-duplicates */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import MessageMediaFile from "../../models/MessageMediaFile";
import StorageService from "../StorageService/StorageService";

const EMAIL_MEDIA_MAX_BYTES = 1_500_000;

export type EscalationTranscriptMessage = {
  id: string;
  fromMe: boolean;
  body: string;
  mediaType: string | null;
  mediaUrl: string | null;
  createdAt: Date;
  visionSummary: string | null;
};

export type EscalationTranscript = {
  messages: EscalationTranscriptMessage[];
  plainText: string;
  htmlBody: string;
  attachments: EscalationEmailAttachment[];
};

export type EscalationEmailAttachment = {
  content: string;
  filename: string;
  content_id: string;
  content_type: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isVisualMedia = (mediaType: string | null): boolean =>
  Boolean(
    mediaType &&
    ["image", "sticker", "photo", "document"].some(type =>
      mediaType.toLowerCase().includes(type)
    )
  );

const formatTimestamp = (date: Date): string =>
  format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });

const resolveEmailMedia = async (
  media: MessageMediaFile,
  companyId: number
): Promise<{
  mediaUrl: string;
  attachment: EscalationEmailAttachment;
} | null> => {
  if (!media.storageKey) {
    return null;
  }

  try {
    await StorageService.ensureReady(companyId);
    const buffer = await StorageService.download(media.storageKey, companyId);
    if (!buffer?.length || buffer.length > EMAIL_MEDIA_MAX_BYTES) {
      return null;
    }

    const mimeType =
      media.mimeType ||
      (isVisualMedia(media.mediaType)
        ? "image/jpeg"
        : "application/octet-stream");
    const contentId = `ticketz-${String(media.messageId).replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    )}`;
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
    const filename =
      media.originalFilename?.trim() ||
      `imagem-${media.messageId}.${extension}`;

    return {
      mediaUrl: `cid:${contentId}`,
      attachment: {
        content: buffer.toString("base64"),
        filename,
        content_id: contentId,
        content_type: mimeType
      }
    };
  } catch {
    return null;
  }
};

const renderMessageHtml = (message: EscalationTranscriptMessage): string => {
  const author = message.fromMe ? "Atendimento (IA/Humano)" : "Cliente";
  const bodyHtml = message.body?.trim()
    ? `<div style="white-space:pre-wrap;margin-top:6px;">${escapeHtml(message.body.trim())}</div>`
    : "";

  const mediaHtml =
    message.mediaUrl && isVisualMedia(message.mediaType)
      ? `<div style="margin-top:10px;">
          <img src="${escapeHtml(message.mediaUrl)}" alt="Imagem da conversa" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;" />
        </div>`
      : message.mediaUrl
        ? `<div style="margin-top:8px;font-size:13px;color:#374151;">
            Anexo (${escapeHtml(message.mediaType || "arquivo")}):
            <a href="${escapeHtml(message.mediaUrl)}" style="color:#2563eb;">abrir mídia</a>
          </div>`
        : "";

  const visionHtml = message.visionSummary?.trim()
    ? `<div style="margin-top:8px;padding:10px 12px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:6px;">
        <div style="font-size:12px;font-weight:600;color:#4338ca;margin-bottom:4px;">Análise da imagem (IA)</div>
        <div style="white-space:pre-wrap;font-size:13px;color:#334155;">${escapeHtml(message.visionSummary.trim())}</div>
      </div>`
    : "";

  return `<div style="margin-bottom:16px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:${message.fromMe ? "#f9fafb" : "#ffffff"};">
    <div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#6b7280;">
      <strong style="color:#111827;">${author}</strong>
      <span>${escapeHtml(formatTimestamp(message.createdAt))}</span>
    </div>
    ${bodyHtml}
    ${mediaHtml}
    ${visionHtml}
  </div>`;
};

export const buildEscalationTranscript = async (
  ticket: Ticket
): Promise<EscalationTranscript> => {
  const [messages, mediaFiles] = await Promise.all([
    Message.findAll({
      where: { ticketId: ticket.id, companyId: ticket.companyId },
      order: [["createdAt", "ASC"]],
      limit: 200
    }),
    MessageMediaFile.findAll({
      where: { ticketId: ticket.id, companyId: ticket.companyId },
      attributes: [
        "messageId",
        "visionSummary",
        "storageKey",
        "mimeType",
        "mediaType",
        "originalFilename",
        "status"
      ]
    })
  ]);

  const visionByMessageId = new Map<string, string>();
  const mediaByMessageId = new Map<string, MessageMediaFile>();
  mediaFiles.forEach(file => {
    if (file.messageId && file.visionSummary?.trim()) {
      visionByMessageId.set(file.messageId, file.visionSummary.trim());
    }
    if (file.messageId) {
      mediaByMessageId.set(file.messageId, file);
    }
  });

  const attachments: EscalationEmailAttachment[] = [];
  const transcriptMessages: EscalationTranscriptMessage[] = await Promise.all(
    messages
      .filter(message => message.mediaType !== "reactionMessage")
      .map(async message => {
        const mediaFile = mediaByMessageId.get(message.id);
        let mediaUrl = message.mediaUrl || null;

        if (
          mediaFile &&
          isVisualMedia(message.mediaType || mediaFile.mediaType)
        ) {
          const emailMedia = await resolveEmailMedia(
            mediaFile,
            ticket.companyId
          );
          if (emailMedia) {
            mediaUrl = emailMedia.mediaUrl;
            attachments.push(emailMedia.attachment);
          }
        }

        return {
          id: message.id,
          fromMe: message.fromMe,
          body: message.body || "",
          mediaType: message.mediaType || null,
          mediaUrl,
          createdAt: message.createdAt,
          visionSummary: visionByMessageId.get(message.id) || null
        };
      })
  );

  const plainLines = transcriptMessages.map(message => {
    const author = message.fromMe ? "Atendimento" : "Cliente";
    const parts = [`[${formatTimestamp(message.createdAt)}] ${author}:`];
    if (message.body.trim()) {
      parts.push(message.body.trim());
    }
    if (message.mediaUrl) {
      parts.push(`[Mídia: ${message.mediaUrl}]`);
    }
    if (message.visionSummary) {
      parts.push(`[Análise IA da imagem: ${message.visionSummary}]`);
    }
    return parts.join("\n");
  });

  const htmlBody = transcriptMessages.map(renderMessageHtml).join("\n");

  return {
    messages: transcriptMessages,
    plainText: plainLines.join("\n\n"),
    htmlBody,
    attachments
  };
};

export const buildEscalationEmailHtml = ({
  ticket,
  contactName,
  contactNumber,
  queueName,
  whatsappName,
  requestNotes,
  requestedByName,
  transcriptHtml,
  formUrl
}: {
  ticket: Ticket;
  contactName: string;
  contactNumber: string;
  queueName: string;
  whatsappName: string;
  requestNotes?: string | null;
  requestedByName?: string | null;
  transcriptHtml: string;
  formUrl: string;
}): string => {
  const notesBlock = requestNotes?.trim()
    ? `<div style="margin:18px 0;padding:14px 16px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
        <div style="font-size:12px;font-weight:700;color:#9a3412;margin-bottom:6px;">Observação de quem solicitou</div>
        <div style="white-space:pre-wrap;color:#7c2d12;">${escapeHtml(requestNotes.trim())}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Solicitação de conserto — Ticket #${ticket.id}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 28px;background:#111827;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.75;">Ticketz — escalação técnica</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;">Solicitação de conserto</h1>
                <p style="margin:10px 0 0;font-size:14px;opacity:0.9;">Ticket #${ticket.id} · ${escapeHtml(contactName || "Cliente")}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                  Um atendimento precisa de correção técnica. Abaixo está o histórico completo da conversa, incluindo imagens e análises da IA.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:14px;line-height:1.7;">
                      <strong>Cliente:</strong> ${escapeHtml(contactName || "—")}<br />
                      <strong>WhatsApp:</strong> ${escapeHtml(contactNumber || "—")}<br />
                      <strong>Conexão:</strong> ${escapeHtml(whatsappName || "—")}<br />
                      <strong>Fila:</strong> ${escapeHtml(queueName || "—")}<br />
                      <strong>Solicitado por:</strong> ${escapeHtml(requestedByName || "Equipe de atendimento")}<br />
                      <strong>Status do ticket:</strong> ${escapeHtml(ticket.status || "—")}
                    </td>
                  </tr>
                </table>
                ${notesBlock}
                <div style="text-align:center;margin:24px 0 28px;">
                  <a href="${escapeHtml(formUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;font-size:15px;">
                    Registrar conserto e avisar cliente
                  </a>
                </div>
                <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
                  Esse botão abre uma página externa ao e-mail. Lá você descreve o que foi corrigido — essa orientação é interna para a IA, que entrará em contato com o cliente no mesmo WhatsApp pedindo para testar.
                </p>
                <h2 style="margin:28px 0 12px;font-size:18px;">Histórico da conversa</h2>
                ${transcriptHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const buildEscalationFormPageHtml = ({
  ticketId,
  contactName,
  contactNumber,
  alreadyResolved,
  errorMessage,
  token,
  formActionUrl
}: {
  ticketId: number;
  contactName: string;
  contactNumber: string;
  alreadyResolved: boolean;
  errorMessage?: string | null;
  token: string;
  formActionUrl?: string | null;
}): string => {
  const backendUrl = (
    process.env.BACKEND_URL || "http://localhost:8080"
  ).replace(/\/$/, "");
  const postUrl =
    formActionUrl || `${backendUrl}/escalation/${encodeURIComponent(token)}`;
  const errorBlock = errorMessage
    ? `<div style="margin-bottom:16px;padding:12px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;">${escapeHtml(errorMessage)}</div>`
    : "";

  if (alreadyResolved) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Conserto registrado</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
    <h1 style="margin-top:0;">Conserto já registrado</h1>
    <p>Este ticket (#${ticketId}) já recebeu a orientação de conserto. A IA deve ter entrado em contato com o cliente para pedir o teste.</p>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Registrar conserto — Ticket #${ticketId}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;padding:24px;">
    <h1 style="margin:0 0 8px;font-size:24px;">Registrar conserto</h1>
    <p style="margin:0 0 18px;color:#4b5563;line-height:1.6;">
      Ticket #${ticketId} · ${escapeHtml(contactName || "Cliente")} · ${escapeHtml(contactNumber || "")}
    </p>
    ${errorBlock}
    <form method="post" action="${escapeHtml(postUrl)}">
      <label for="humanGuidance" style="display:block;font-weight:700;margin-bottom:8px;">
        O que foi corrigido? (orientação interna para a IA)
      </label>
      <p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5;">
        Escreva aqui o que você fez ou o que a IA precisa saber. Esse texto <strong>não</strong> será enviado literalmente ao cliente.
        A IA vai usar essa orientação para avisar o cliente no WhatsApp, pedir para testar e confirmar se está tudo ok.
      </p>
      <textarea id="humanGuidance" name="humanGuidance" required minlength="10" maxlength="8000" rows="10" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;line-height:1.5;"></textarea>
      <label for="resolvedByEmail" style="display:block;font-weight:700;margin:18px 0 8px;">
        Seu e-mail (opcional)
      </label>
      <input id="resolvedByEmail" name="resolvedByEmail" type="email" maxlength="255" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;" />
      <button type="submit" style="margin-top:20px;background:#2563eb;color:#fff;border:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:700;cursor:pointer;">
        Salvar e avisar cliente via IA
      </button>
    </form>
  </div>
</body>
</html>`;
};

export const buildEscalationSuccessPageHtml = (ticketId: number): string =>
  `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Conserto registrado</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
    <h1 style="margin-top:0;color:#166534;">Conserto registrado</h1>
    <p>A orientação foi salva e a IA foi acionada para avisar o cliente do ticket #${ticketId} no WhatsApp e pedir para testar.</p>
    <p style="color:#4b5563;">Você já pode fechar esta página.</p>
  </div>
</body>
</html>`;

export const buildEscalationErrorPageHtml = (message: string): string =>
  `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro — escalação</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #fecaca;">
    <h1 style="margin-top:0;color:#991b1b;">Não foi possível abrir o formulário</h1>
    <p style="color:#374151;line-height:1.6;">${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
