import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";

const DUPLICATE_WINDOW_MS = 120000;

export const sendAiWhatsAppReply = async ({
  ticket,
  body,
  skipDuplicateCheck = false
}: {
  ticket: Ticket;
  body: string;
  skipDuplicateCheck?: boolean;
}): Promise<boolean> => {
  const normalized = body.trim();
  if (!normalized) {
    return false;
  }

  if (!skipDuplicateCheck) {
    const lastOutbound = await Message.findOne({
      where: { ticketId: ticket.id, fromMe: true },
      order: [["createdAt", "DESC"]],
      attributes: ["body", "createdAt"]
    });

    if (lastOutbound?.body?.trim() === normalized) {
      const ageMs = Date.now() - new Date(lastOutbound.createdAt).getTime();
      if (ageMs < DUPLICATE_WINDOW_MS) {
        return false;
      }
    }
  }

  await SendWhatsAppMessage({
    body: formatBody(normalized, ticket),
    ticket
  });

  return true;
};

/** Envia resposta ao cliente; repete com skip de duplicata se necessário. */
export const deliverAiReply = async (
  ticket: Ticket,
  body: string
): Promise<boolean> => {
  const sent = await sendAiWhatsAppReply({ ticket, body });
  if (sent) {
    return true;
  }

  return sendAiWhatsAppReply({
    ticket,
    body,
    skipDuplicateCheck: true
  });
};
