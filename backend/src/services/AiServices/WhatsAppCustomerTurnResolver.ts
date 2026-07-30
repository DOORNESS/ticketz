import Message from "../../models/Message";
import {
  isInformationalIntent,
  isPureGreetingMessage,
  isShortHelpRequest,
  isWaitingForBotNudge,
  pickPrimaryCustomerText
} from "./Triage/CaseCompletenessEngine";
import {
  extractInboundImageContextParts,
  mergeInboundImageContextParts
} from "./InboundImageContext";
import { logger } from "../../utils/logger";

export const findUnansweredCustomerQuestion = async (
  ticketId: number
): Promise<string | null> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]],
    limit: 20,
    attributes: ["body", "fromMe", "createdAt"]
  });

  for (const message of messages) {
    if (message.fromMe) {
      continue;
    }

    const body = (message.body || "").trim();
    if (
      !body ||
      isPureGreetingMessage(body) ||
      isShortHelpRequest(body) ||
      isWaitingForBotNudge(body)
    ) {
      continue;
    }

    const messageTime = new Date(message.createdAt).getTime();
    const answered = messages.some(
      item =>
        item.fromMe &&
        new Date(item.createdAt).getTime() > messageTime &&
        (item.body || "").trim().length >= 12
    );

    if (!answered) {
      return body;
    }

    return null;
  }

  return null;
};

export const resolveCustomerTurnText = async ({
  ticketId,
  rawUserText,
  messageParts
}: {
  ticketId: number;
  rawUserText: string;
  messageParts: string[];
}): Promise<string> => {
  const imageContextParts = extractInboundImageContextParts(messageParts);

  let userText =
    messageParts.length > 1
      ? pickPrimaryCustomerText(messageParts)
      : rawUserText.trim();

  if (messageParts.length > 1) {
    const allSocialOnly = messageParts.every(
      part =>
        isPureGreetingMessage(part) ||
        isShortHelpRequest(part) ||
        isWaitingForBotNudge(part)
    );

    if (allSocialOnly) {
      userText =
        messageParts.find(part => isPureGreetingMessage(part)) ||
        messageParts[0];
    }
  }

  userText = mergeInboundImageContextParts(userText, messageParts);

  if (isWaitingForBotNudge(userText) && !imageContextParts.length) {
    const recent = await Message.findAll({
      where: { ticketId, fromMe: false },
      order: [["createdAt", "DESC"]],
      limit: 8,
      attributes: ["body"]
    });

    const replay = recent
      .map(item => (item.body || "").trim())
      .find(
        body =>
          body &&
          !isPureGreetingMessage(body) &&
          !isShortHelpRequest(body) &&
          !isWaitingForBotNudge(body)
      );

    if (replay) {
      return replay;
    }
  }

  const unanswered = await findUnansweredCustomerQuestion(ticketId);
  if (unanswered && !imageContextParts.length) {
    const incomingIsOnlySocial =
      isPureGreetingMessage(userText) ||
      isShortHelpRequest(userText) ||
      isWaitingForBotNudge(userText);

    if (incomingIsOnlySocial || !isInformationalIntent(userText)) {
      logger.info(
        { ticketId, unanswered, incoming: userText.slice(0, 80) },
        "Prioritizing unanswered customer question over greeting/nudge"
      );
      return unanswered;
    }
  }

  return userText;
};
