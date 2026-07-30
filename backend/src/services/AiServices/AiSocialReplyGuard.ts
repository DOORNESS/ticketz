import Message from "../../models/Message";

const SOCIAL_ACK_PATTERNS = [
  /como posso ajudar/,
  /em que posso ajudar/,
  /me diga como posso/,
  /por favor,? me diga/,
  /qual e a sua duvida/,
  /qual é a sua dúvida/,
  /claro.*ajudar/,
  /vou ajudar com base nos materiais/
];

export const normalizeSocialReplyText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isSocialAcknowledgementBody = (text: string): boolean => {
  const normalized = normalizeSocialReplyText(text);
  if (!normalized) {
    return false;
  }

  return SOCIAL_ACK_PATTERNS.some(pattern => pattern.test(normalized));
};

export const isSimilarSocialAcknowledgement = (
  previous: string,
  next: string
): boolean => {
  const normalizedPrevious = normalizeSocialReplyText(previous);
  const normalizedNext = normalizeSocialReplyText(next);

  if (!normalizedPrevious || !normalizedNext) {
    return false;
  }

  if (normalizedPrevious === normalizedNext) {
    return true;
  }

  return (
    isSocialAcknowledgementBody(normalizedPrevious) &&
    isSocialAcknowledgementBody(normalizedNext)
  );
};

export const hasRecentSocialAcknowledgement = async (
  ticketId: number,
  maxAgeMs = 90000
): Promise<boolean> => {
  const lastOutbound = await Message.findOne({
    where: { ticketId, fromMe: true },
    order: [["createdAt", "DESC"]],
    attributes: ["body", "createdAt"]
  });

  if (!lastOutbound?.body?.trim()) {
    return false;
  }

  const ageMs = Date.now() - new Date(lastOutbound.createdAt).getTime();
  if (ageMs > maxAgeMs) {
    return false;
  }

  return isSocialAcknowledgementBody(lastOutbound.body);
};
