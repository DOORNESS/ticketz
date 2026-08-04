import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import formatBody from "../../helpers/Mustache";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";
import { isSimilarSocialAcknowledgement } from "./AiSocialReplyGuard";
import {
  isDeferredQuestionEnabled,
  scheduleDeferredQuestion
} from "./AiDeferredQuestionService";
import { splitDeferrableConfirmation } from "./AiDeferredQuestionRules";

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
    const [lastOutbound, lastInbound] = await Promise.all([
      Message.findOne({
        where: { ticketId: ticket.id, fromMe: true },
        order: [["createdAt", "DESC"]],
        attributes: ["body", "createdAt"]
      }),
      Message.findOne({
        where: { ticketId: ticket.id, fromMe: false },
        order: [["createdAt", "DESC"]],
        attributes: ["createdAt"]
      })
    ]);

    if (lastOutbound?.body?.trim()) {
      const ageMs = Date.now() - new Date(lastOutbound.createdAt).getTime();
      const inboundAfterOutbound =
        lastInbound &&
        new Date(lastInbound.createdAt).getTime() >
          new Date(lastOutbound.createdAt).getTime();

      const isExactDuplicate =
        lastOutbound.body.trim() === normalized &&
        ageMs < DUPLICATE_WINDOW_MS &&
        !inboundAfterOutbound;

      const isSimilarSocialDuplicate =
        ageMs < DUPLICATE_WINDOW_MS &&
        !inboundAfterOutbound &&
        isSimilarSocialAcknowledgement(lastOutbound.body, normalized);

      if (isExactDuplicate || isSimilarSocialDuplicate) {
        return true;
      }
    }
  }

  try {
    await SendWhatsAppMessage({
      body: formatBody(normalized, ticket),
      ticket,
      linkPreview: false
    });
    return true;
  } catch (error) {
    logger.error({ error, ticketId: ticket.id }, "sendAiWhatsAppReply failed");
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("ERR_SENDING_WAPP_MSG", 400);
  }
};

/** Envia resposta ao cliente; repete com skip de duplicata se necessário. */
export const deliverAiReply = async (
  ticket: Ticket,
  body: string,
  { allowDefer = true }: { allowDefer?: boolean } = {}
): Promise<boolean> => {
  let outbound = body;
  let deferredQuestion: string | null = null;

  // Cobrar "Conseguiu localizar sua conta?" na mesma mensagem que acabou de
  // mandar o cliente abrir um link é pedir resposta antes de haver o que
  // responder. A pergunta sai depois, e só se o cliente ficar em silêncio.
  if (allowDefer && isDeferredQuestionEnabled()) {
    const split = splitDeferrableConfirmation(body);
    if (split) {
      outbound = split.immediate;
      deferredQuestion = split.deferred;
    }
  }

  const sent =
    (await sendAiWhatsAppReply({ ticket, body: outbound })) ||
    (await sendAiWhatsAppReply({
      ticket,
      body: outbound,
      skipDuplicateCheck: true
    }));

  if (sent && deferredQuestion) {
    await scheduleDeferredQuestion({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      question: deferredQuestion
    }).catch(error => {
      logger.warn(
        { error, ticketId: ticket.id },
        "Failed to schedule deferred AI question"
      );
    });
  }

  return sent;
};
