import moment from "moment";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import { assertCanAcceptTicket } from "../../helpers/assertCanAcceptTicket";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import { startQueue, verifyMessage } from "../WbotServices/wbotMessageListener";
import AppError from "../../errors/AppError";
import {
  logInvalidAiTicketState,
  normalizeAiTicketFields
} from "../AiServices/AiTicketStateService";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import User from "../../models/User";
import formatBody from "../../helpers/Mustache";
import { logger } from "../../utils/logger";
import { incrementCounter } from "../CounterServices/IncrementCounter";
import { getJidOf } from "../WbotServices/getJidOf";
import Queue from "../../models/Queue";
import { _t } from "../TranslationServices/i18nService";
import { logAiOperationalEvent } from "../AiServices/AiOperationalLogService";

export interface UpdateTicketData {
  status?: string;
  userId?: number | null;
  queueId?: number | null;
  chatbot?: boolean;
  queueOptionId?: number;
  justClose?: boolean;
  aiHandoff?: boolean;
  aiAgentId?: number | null;
  aiHandoffReason?: string | null;
  aiPaused?: boolean;
  aiResolvedByAi?: boolean;
  aiHandoffAt?: Date | null;
  aiWaitingSince?: Date | null;
  aiStartedAt?: Date | null;
  aiSlaBreached?: boolean;
  aiEndedAt?: Date | null;
  aiHandoffSummary?: string | null;
  aiPriority?: string | null;
  aiLastConfidence?: number | null;
  aiHandoffMode?: string | null;
  aiHandoffOriginalReason?: string | null;
  aiCaseCompleteness?: object | null;
  aiInvestigationRound?: number;
  aiCorrelationId?: string | null;
  aiProcessingState?: string | null;
  aiSkipLegacyOutOfHoursOnHandoff?: boolean;
  aiAssistActive?: boolean;
  aiAssistMode?: string | null;
  aiAssistRequestedAt?: Date | null;
  aiAssistRequestedBy?: number | null;
  aiAssistAgentId?: number | null;
  aiHumanAssumedAt?: Date | null;
  aiHumanAssumedBy?: number | null;
}

interface Request {
  ticketData: UpdateTicketData;
  ticketId: number;
  reqUserId?: number;
  companyId?: number | undefined;
  dontRunChatbot?: boolean;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const sendFormattedMessage = async (
  message: string,
  ticket: Ticket,
  user?: User
) => {
  const messageText = formatBody(message, ticket, user);

  const wbot = await GetTicketWbot(ticket);
  const queueChangedMessage = await wbot.sendMessage(getJidOf(ticket), {
    text: messageText
  });
  await verifyMessage(queueChangedMessage, ticket, ticket.contact);
};

export function websocketUpdateTicket(ticket: Ticket, moreChannels?: string[]) {
  const io = getIO();
  let ioStack = io.to(ticket.id.toString());

  if (ticket.userId) {
    ioStack = ioStack.to(`user-${ticket.userId}`);
  }

  if (ticket.queueId) {
    ioStack = ioStack
      .to(`queue-${ticket.queueId}-notification`)
      .to(`queue-${ticket.queueId}-${ticket.status}`);
  }

  ioStack = ioStack
    .to(`company-${ticket.companyId}-notification`)
    .to(`company-${ticket.companyId}-${ticket.status}`);

  if (moreChannels) {
    moreChannels.forEach(channel => {
      ioStack = ioStack.to(channel);
    });
  }

  ioStack.emit(`company-${ticket.companyId}-ticket`, {
    action: "update",
    ticket
  });
}

const UpdateTicketService = async ({
  ticketData,
  ticketId,
  reqUserId,
  companyId,
  dontRunChatbot
}: Request): Promise<Response> => {
  try {
    if (!companyId && !reqUserId) {
      throw new Error("Need reqUserId or companyId");
    }

    const user = reqUserId ? await User.findByPk(reqUserId) : null;

    if (reqUserId) {
      if (!user) {
        throw new AppError("User not found", 404);
      }
      companyId = user.companyId;
    }
    const { justClose } = ticketData;
    let { status } = ticketData;
    let { queueId, userId } = ticketData;
    const fromChatbot = ticketData.chatbot || false;
    let chatbot: boolean | null = fromChatbot;
    let queueOptionId: number | null = ticketData.queueOptionId || null;
    let aiHandoff = ticketData.aiHandoff;
    let aiAgentId = ticketData.aiAgentId;
    const aiHandoffReason = ticketData.aiHandoffReason;
    const aiPaused = ticketData.aiPaused;
    const aiResolvedByAi = ticketData.aiResolvedByAi;
    const aiHandoffAt = ticketData.aiHandoffAt;
    const aiWaitingSince = ticketData.aiWaitingSince;
    const aiStartedAt = ticketData.aiStartedAt;
    const aiSlaBreached = ticketData.aiSlaBreached;

    const io = getIO();

    const userRatingSetting = await GetCompanySetting(
      companyId,
      "userRating",
      "disabled"
    );

    const ticket = await ShowTicketService(ticketId, companyId);
    const isGroup = ticket.contact?.isGroup || ticket.isGroup;

    if (queueId && queueId !== ticket.queueId) {
      const newQueue = await Queue.findByPk(queueId);
      if (!newQueue) {
        throw new AppError("Queue not found", 404);
      }
      if (newQueue.companyId !== ticket.companyId) {
        throw new AppError("Queue does not belong to the same company", 403);
      }
    }

    if (user && ticket.status !== "pending") {
      const isAiTakeover =
        !ticket.userId && userId && (ticket.aiAgentId || ticket.aiHandoff);
      const isReopeningClosed =
        ticket.status === "closed" && status === "open";
      const isAssignedAgent =
        ticket.userId &&
        Number(ticket.userId) === Number(user.id);

      if (
        !isAiTakeover &&
        !isReopeningClosed &&
        user.profile !== "admin" &&
        !user.super &&
        !isAssignedAgent
      ) {
        throw new AppError("ERR_FORBIDDEN", 403);
      }
    }

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId,
      companyId,
      whatsappId: ticket.whatsappId
    });

    if (ticket.channel === "whatsapp" && status === "open") {
      try {
        await SetTicketMessagesAsRead(ticket);
      } catch (err) {
        logger.error(
          { ticketId, message: err?.message },
          "Could not set messages as read."
        );
      }
    }

    const oldStatus = ticket.status;
    const oldUserId = ticket.user?.id;
    const oldQueueId = ticket.queueId;

    // only admin can accept pending tickets that have no queue (except IA handoff)
    if (!oldQueueId && userId && oldStatus === "pending" && status === "open") {
      const acceptUser = await User.findByPk(userId);
      const isAiHandoffAccept = Boolean(ticket.aiHandoff);
      if (acceptUser.profile !== "admin" && !acceptUser.super && !isAiHandoffAccept) {
        throw new AppError("ERR_NO_PERMISSION", 403);
      }
    }

    if (
      user &&
      oldStatus === "pending" &&
      status === "open" &&
      userId &&
      !ticket.userId
    ) {
      await assertCanAcceptTicket(ticket, user);
    }

    if (oldStatus === "closed") {
      await CheckContactOpenTickets(
        ticket.contactId,
        ticket.whatsappId,
        false,
        ticket.id
      );
      chatbot = null;
      queueOptionId = null;
    }

    if (status !== undefined && ["closed"].indexOf(status) > -1) {
      if (!ticketTraking.finishedAt) {
        ticketTraking.finishedAt = moment().toDate();
        ticketTraking.whatsappId = ticket.whatsappId;
        ticketTraking.userId = ticket.userId;
      }

      if (
        userRatingSetting === "enabled" &&
        ticket.whatsapp?.status === "CONNECTED" &&
        ticket.userId &&
        !isGroup &&
        !ticket.contact.disableBot
      ) {
        if (!ticketTraking.ratingAt && !justClose) {
          if (ticket.channel === "whatsapp") {
            const satisfactionQuestion = ticket.aiResolvedByAi
              ? "Sua dúvida foi resolvida pela IA?"
              : "Sua dúvida foi resolvida?";
            const ratingTxt =
              ticket.whatsapp.ratingMessage?.trim() ||
              _t("Please rate our service", ticket);
            const rateInstructions = `${satisfactionQuestion}\n⭐⭐⭐⭐⭐\n${_t("Send a rating from 1 to 5", ticket)}`;
            const rateReturn = _t(
              "Send *`!`* to return to the service",
              ticket
            );
            const bodyRatingMessage = `${ratingTxt}\n\n*${rateInstructions}*\n\n${rateReturn}`;

            await SendWhatsAppMessage({ body: bodyRatingMessage, ticket });
          }

          ticketTraking.ratingAt = moment().toDate();
          await ticketTraking.save();

          await ticket.update({
            chatbot: null,
            queueOptionId: null,
            status: "closed"
          });

          await ticket.reload();

          io.to(`company-${ticket.companyId}-open`)
            .to(`queue-${ticket.queueId}-open`)
            .to(ticketId.toString())
            .emit(`company-${ticket.companyId}-ticket`, {
              action: "delete",
              ticketId: ticket.id
            });

          io.to(`company-${ticket.companyId}-closed`)
            .to(`queue-${ticket.queueId}-closed`)
            .to(ticket.id.toString())
            .emit(`company-${ticket.companyId}-ticket`, {
              action: "update",
              ticket,
              ticketId: ticket.id
            });

          return { ticket, oldStatus, oldUserId };
        }
      }

      if (
        !isGroup &&
        !ticket.contact.disableBot &&
        !justClose &&
        ticket.whatsapp?.complationMessage?.trim() &&
        ticket.whatsapp.status === "CONNECTED"
      ) {
        const body = formatBody(
          `${ticket.whatsapp.complationMessage.trim()}`,
          ticket
        );

        if (ticket.channel === "whatsapp" && !isGroup) {
          const sentMessage = await SendWhatsAppMessage({ body, ticket });

          await verifyMessage(sentMessage, ticket, ticket.contact);
        }
      }

      const keepUserAndQueue = await GetCompanySetting(
        companyId,
        "keepUserAndQueue",
        "enabled"
      );

      if (keepUserAndQueue === "disabled") {
        queueId = null;
        userId = null;
      }
    }

    if (queueId !== undefined && queueId !== null && !ticketTraking.startedAt) {
      ticketTraking.queuedAt = moment().toDate();
    }

    // Only stamp chatbotendAt on the first chatbot→human hand-off, i.e. before
    // the ticket has ever been accepted (startedAt not yet set). Subsequent
    // transfers that go through a chatbot queue and then back should not
    // overwrite this field; they belong to serviceTime, not waitTime.
    if (ticket.chatbot && !chatbot && !ticketTraking.startedAt) {
      ticketTraking.chatbotendAt = moment().toDate();
    }

    const humanAccepted =
      status === "open" &&
      userId &&
      userId !== oldUserId &&
      (ticket.aiAgentId || ticket.aiHandoff);

    if (humanAccepted) {
      aiHandoff = true;
      ticketData.aiHumanAssumedAt = new Date();
      ticketData.aiHumanAssumedBy = userId;
      if (ticket.aiHandoffReason && !ticket.aiHandoffOriginalReason) {
        ticketData.aiHandoffOriginalReason = ticket.aiHandoffReason;
      }
      if (!ticket.aiHandoffMode) {
        ticketData.aiHandoffMode = "definitive";
      }
      ticketData.aiPaused = true;
      ticketData.aiProcessingState = "awaiting_human";
    }

    const normalizedTicketData = normalizeAiTicketFields(ticket, {
      status,
      queueId,
      userId,
      aiHandoff,
      aiAgentId,
      aiPaused,
      aiResolvedByAi,
      ...ticketData
    });

    const effectiveQueueId =
      normalizedTicketData.queueId !== undefined
        ? (normalizedTicketData.queueId as number | null)
        : queueId;

    await ticket.update({
      status,
      queueId: effectiveQueueId,
      userId,
      whatsappId: ticket.whatsappId,
      chatbot,
      queueOptionId,
      aiHandoff: aiHandoff !== undefined ? aiHandoff : ticket.aiHandoff,
      aiAgentId: aiAgentId !== undefined ? aiAgentId : ticket.aiAgentId,
      aiHandoffReason:
        aiHandoffReason !== undefined
          ? aiHandoffReason
          : ticket.aiHandoffReason,
      aiPaused: aiPaused !== undefined ? aiPaused : ticket.aiPaused,
      aiResolvedByAi:
        aiResolvedByAi !== undefined ? aiResolvedByAi : ticket.aiResolvedByAi,
      aiHandoffAt: aiHandoffAt !== undefined ? aiHandoffAt : ticket.aiHandoffAt,
      aiWaitingSince:
        aiWaitingSince !== undefined ? aiWaitingSince : ticket.aiWaitingSince,
      aiStartedAt: aiStartedAt !== undefined ? aiStartedAt : ticket.aiStartedAt,
      aiSlaBreached:
        aiSlaBreached !== undefined ? aiSlaBreached : ticket.aiSlaBreached,
      ...(ticketData.aiHandoffMode !== undefined
        ? { aiHandoffMode: ticketData.aiHandoffMode }
        : {}),
      ...(ticketData.aiHandoffOriginalReason !== undefined
        ? { aiHandoffOriginalReason: ticketData.aiHandoffOriginalReason }
        : {}),
      ...(ticketData.aiCaseCompleteness !== undefined
        ? { aiCaseCompleteness: ticketData.aiCaseCompleteness }
        : {}),
      ...(ticketData.aiInvestigationRound !== undefined
        ? { aiInvestigationRound: ticketData.aiInvestigationRound }
        : {}),
      ...(ticketData.aiCorrelationId !== undefined
        ? { aiCorrelationId: ticketData.aiCorrelationId }
        : {}),
      ...(ticketData.aiProcessingState !== undefined
        ? { aiProcessingState: ticketData.aiProcessingState }
        : {}),
      ...(ticketData.aiSkipLegacyOutOfHoursOnHandoff !== undefined
        ? {
            aiSkipLegacyOutOfHoursOnHandoff:
              ticketData.aiSkipLegacyOutOfHoursOnHandoff
          }
        : {}),
      ...(ticketData.aiAssistActive !== undefined
        ? { aiAssistActive: ticketData.aiAssistActive }
        : {}),
      ...(ticketData.aiAssistMode !== undefined
        ? { aiAssistMode: ticketData.aiAssistMode }
        : {}),
      ...(ticketData.aiAssistRequestedAt !== undefined
        ? { aiAssistRequestedAt: ticketData.aiAssistRequestedAt }
        : {}),
      ...(ticketData.aiAssistRequestedBy !== undefined
        ? { aiAssistRequestedBy: ticketData.aiAssistRequestedBy }
        : {}),
      ...(ticketData.aiAssistAgentId !== undefined
        ? { aiAssistAgentId: ticketData.aiAssistAgentId }
        : {}),
      ...(ticketData.aiHumanAssumedAt !== undefined
        ? { aiHumanAssumedAt: ticketData.aiHumanAssumedAt }
        : {}),
      ...(ticketData.aiHumanAssumedBy !== undefined
        ? { aiHumanAssumedBy: ticketData.aiHumanAssumedBy }
        : {})
    });

    if (oldStatus !== status) {
      if (oldStatus === "closed" && status === "open") {
        await incrementCounter(companyId, "ticket-reopen");
      } else if (status === "open") {
        await incrementCounter(companyId, "ticket-accept");
      } else if (status === "closed") {
        await incrementCounter(companyId, "ticket-close");
      } else if (status === "pending" && oldQueueId !== queueId) {
        await incrementCounter(companyId, "ticket-transfer");
      }
    }

    await ticket.reload();
    logInvalidAiTicketState(ticket, "UpdateTicketService");

    if (humanAccepted) {
      await logAiOperationalEvent({
        companyId,
        ticketId: ticket.id,
        event: "human_assumed",
        details: { userId, previousStatus: oldStatus }
      });
    }

    const humanClosed =
      ticket.status === "closed" &&
      oldStatus !== "closed" &&
      !ticket.aiResolvedByAi &&
      (ticket.aiStartedAt || ticket.aiAgentId);

    if (humanClosed) {
      await logAiOperationalEvent({
        companyId,
        ticketId: ticket.id,
        event: "ticket_closed_by_human",
        details: { userId: ticket.userId || userId }
      });
    }

    if (ticket.status === "closed" && ticket.aiStartedAt && !ticket.aiEndedAt) {
      await ticket.update({ aiEndedAt: new Date() });
    }

    status = ticket.status;

    if (
      status !== undefined &&
      status === "pending" &&
      oldStatus !== "pending"
    ) {
      if (!ticketTraking.startedAt) {
        ticketTraking.whatsappId = ticket.whatsappId;
        ticketTraking.queuedAt = moment().toDate();
        ticketTraking.startedAt = null;
        ticketTraking.userId = null;
      }
      io.to(`company-${companyId}-mainchannel`).emit(
        `company-${companyId}-ticket`,
        {
          action: "removeFromList",
          ticketId: ticket?.id
        }
      );
    }

    if (status !== undefined && status === "open" && oldStatus !== "open") {
      if (!ticketTraking.startedAt) {
        ticketTraking.startedAt = moment().toDate();
        ticketTraking.ratingAt = null;
        ticketTraking.rated = false;
        ticketTraking.whatsappId = ticket.whatsappId;
        ticketTraking.userId = ticket.userId;
      }
      io.to(`company-${companyId}-mainchannel`).emit(
        `company-${companyId}-ticket`,
        {
          action: "removeFromList",
          ticketId: ticket?.id
        }
      );

      io.to(`company-${companyId}-mainchannel`).emit(
        `company-${companyId}-ticket`,
        {
          action: "updateUnread",
          ticketId: ticket?.id
        }
      );
    }

    ticketTraking.save();

    if (
      !dontRunChatbot &&
      !ticket.userId &&
      ticket.queueId &&
      ticket.queueId !== oldQueueId &&
      !ticket.aiSkipLegacyOutOfHoursOnHandoff
    ) {
      const wbot = await GetTicketWbot(ticket);
      if (wbot) {
        await startQueue(wbot, ticket);
        await ticket.reload();
      }
    }

    if (
      !isGroup &&
      !ticket.chatbot &&
      !ticket.contact.disableBot &&
      !fromChatbot &&
      !dontRunChatbot
    ) {
      let accepted = false;
      if (
        ticket.userId &&
        ticket.status === "open" &&
        ticket.userId !== oldUserId
      ) {
        const acceptedMessage = await GetCompanySetting(
          companyId,
          "ticketAcceptedMessage",
          ""
        );

        if (acceptedMessage && ticket.whatsapp?.status === "CONNECTED") {
          const acceptUser = await User.findByPk(userId);
          await sendFormattedMessage(acceptedMessage, ticket, acceptUser);
          accepted = true;
        }
      }

      if (
        !accepted &&
        oldQueueId &&
        ticket.queueId &&
        oldQueueId !== ticket.queueId &&
        ticket.whatsapp?.status === "CONNECTED"
      ) {
        const systemTransferMessage = await GetCompanySetting(
          companyId,
          "transferMessage",
          ""
        );
        const transferMessage =
          ticket.whatsapp.transferMessage || systemTransferMessage;

        if (transferMessage) {
          await sendFormattedMessage(transferMessage, ticket);
        }
      }
    }

    if (justClose && status === "closed") {
      io.to(`company-${companyId}-mainchannel`).emit(
        `company-${companyId}-ticket`,
        {
          action: "removeFromList",
          ticketId: ticket?.id
        }
      );
    } else if (ticket.status === "closed" && ticket.status !== oldStatus) {
      io.to(`company-${companyId}-${oldStatus}`)
        .to(`queue-${ticket.queueId}-${oldStatus}`)
        .to(`user-${oldUserId}`)
        .emit(`company-${companyId}-ticket`, {
          action: "removeFromList",
          ticketId: ticket.id
        });
    }

    websocketUpdateTicket(ticket, [`user-${oldUserId}`]);

    return { ticket, oldStatus, oldUserId };
  } catch (err) {
    logger.error(
      { error: err?.name, message: err?.message, stack: err?.stack },
      "UpdateTicketService"
    );
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError("Error updating ticket", 500);
  }
};

export default UpdateTicketService;
