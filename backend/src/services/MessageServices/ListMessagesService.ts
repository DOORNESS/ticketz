import { FindOptions, Op } from "sequelize";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import ShowTicketService from "../TicketServices/ShowTicketService";
import Queue from "../../models/Queue";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { resolveMessageMediaUrls } from "../MediaServices/MediaAccessService";
import { logger } from "../../utils/logger";

interface Request {
  ticketId: string;
  companyId: number;
  user?: User;
  nextId?: string;
  queues?: number[];
  minUpdatedAt?: string;
}

interface Response {
  messages: Message[];
  ticket: Ticket;
  count: number | null;
  hasMore: boolean;
  nextId: string | null;
}

const ListMessagesService = async ({
  nextId,
  ticketId,
  companyId,
  user,
  queues = [],
  minUpdatedAt
}: Request): Promise<Response> => {
  // Incremental polling only needs tenancy and channel information. Avoid
  // rebuilding the complete ticket/contact/tag graph every few seconds.
  const ticket = minUpdatedAt
    ? await Ticket.findOne({
        where: { id: ticketId, companyId },
        attributes: ["id", "companyId", "channel"]
      })
    : await ShowTicketService(ticketId, companyId);

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  const limit = 100;

  const options: FindOptions = {
    where: {
      ticketId,
      companyId,
      mediaType: {
        [Op.or]: {
          [Op.ne]: "reactionMessage",
          [Op.is]: null
        }
      }
    }
  };

  if (
    queues.length > 0 &&
    (await GetCompanySetting(companyId, "messageVisibility", "message")) ===
      "message"
  ) {
    options.where["queueId"] = {
      [Op.or]: {
        [Op.in]: queues,
        [Op.eq]: null
      }
    };
  }

  if (minUpdatedAt) {
    const parsedMinUpdatedAt = new Date(minUpdatedAt);

    if (Number.isNaN(parsedMinUpdatedAt.getTime())) {
      throw new AppError("ERR_INVALID_MIN_UPDATED_AT", 400);
    }

    options.where["updatedAt"] = {
      [Op.gte]: parsedMinUpdatedAt
    };
  } else if (nextId) {
    const cursorMessage = await Message.findOne({
      where: {
        id: nextId,
        ticketId,
        companyId
      },
      attributes: ["id", "createdAt"]
    });

    if (!cursorMessage) {
      throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
    }

    options.where["createdAt"] = {
      [Op.lt]: cursorMessage.createdAt
    };
  }

  const messages = await Message.findAll({
    ...options,
    limit: limit + 1,
    include: [
      "contact",
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"],
        where: {
          companyId: ticket.companyId
        },
        required: false
      },
      {
        model: Message,
        as: "replies",
        where: {
          ticketId: ticket.id
        },
        include: ["contact"],
        required: false
      },
      {
        model: Queue,
        as: "queue"
      }
    ],
    order: [["createdAt", "DESC"]]
  });

  const hasMore = messages.length > limit;
  const visibleMessages = hasMore ? messages.slice(0, limit) : messages;
  const oldestMessage = visibleMessages[visibleMessages.length - 1];
  const orderedMessages = visibleMessages.reverse();

  if (user) {
    try {
      await resolveMessageMediaUrls({
        messages: orderedMessages,
        user,
        companyId
      });
    } catch (error) {
      // Media URL resolution must never take tickets offline.
      logger.warn(
        { error },
        "ListMessagesService: resolveMessageMediaUrls failed"
      );
    }
  }

  return {
    messages: orderedMessages,
    ticket,
    count: null,
    hasMore,
    nextId: hasMore && oldestMessage ? oldestMessage.id : null
  };
};

export default ListMessagesService;
