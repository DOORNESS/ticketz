import { checkCompanyCompliant } from "../../helpers/CheckCompanyCompliant";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import OldMessage from "../../models/OldMessage";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import {
  generateCopilotSuggestion,
  shouldRunCopilot
} from "../AiServices/AiCopilotService";
import { shouldSuppressHumanNotification } from "../AiServices/AiHelpers";
import { serializeTicketWithOperationalState } from "../TicketServices/TicketOperationalStateService";

interface MessageData {
  id: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  ack?: number;
  queueId?: number;
  channel?: string;
}
interface Request {
  messageData: MessageData;
  companyId: number;
  skipWebsocket?: boolean;
}

export const websocketCreateMessage = async (
  message: Message,
  options?: { forceHumanAlert?: boolean }
) => {
  const io = getIO();
  let ticket = message.ticket;
  const suppressHumanAlert =
    shouldSuppressHumanNotification(ticket) && !options?.forceHumanAlert;

  // The open chat needs only the new message. Emit it before the expensive
  // ticket reload so a list-enrichment failure can never block real-time chat.
  io.to(message.ticketId.toString()).emit(
    `company-${message.companyId}-appMessage`,
    {
      action: "create",
      message,
      ticket: ticket
        ? serializeTicketWithOperationalState(ticket)
        : { id: message.ticketId },
      contact: ticket?.contact,
      suppressHumanAlert
    }
  );

  try {
    await ticket.reload({
      include: [
        {
          model: Contact,
          as: "contact",
          include: ["tags", "extraInfo"]
        },
        "queue",
        "tags",
        "user",
        {
          model: Whatsapp,
          as: "whatsapp",
          attributes: ["name", "id"]
        }
      ]
    });
  } catch (error) {
    logger.warn(
      {
        error,
        step: "websocket_list_enrichment",
        ticketId: message.ticketId,
        messageId: message.id,
        companyId: message.companyId
      },
      "Message emitted to chat, but ticket list enrichment failed"
    );
    return;
  }

  ticket = message.ticket;
  const listPayload = {
    action: "create",
    message,
    ticket: serializeTicketWithOperationalState(ticket),
    contact: ticket.contact,
    suppressHumanAlert
  };

  let listStack = io
    .to(`company-${message.companyId}-${message.ticket.status}`)
    .to(`company-${message.companyId}-notification`);

  if (message.ticket.queueId) {
    listStack = listStack
      .to(`queue-${message.ticket.queueId}-${message.ticket.status}`)
      .to(`queue-${message.ticket.queueId}-notification`);
  }

  listStack.emit(`company-${message.companyId}-appMessage`, listPayload);

  if (ticket.aiHandoff && ticket.queueId && !message.fromMe) {
    io.to(`queue-${ticket.queueId}-handoff`)
      .to(`queue-${ticket.queueId}-notification`)
      .emit(`company-${message.companyId}-handoff`, {
        action: "handoff_alert",
        ticket,
        message
      });
  }
};

const CreateMessageService = async ({
  messageData,
  companyId,
  skipWebsocket
}: Request): Promise<Message> => {
  await Message.upsert({ ...messageData, companyId });

  const message = await Message.findOne({
    where: {
      id: messageData.id,
      ticketId: messageData.ticketId
    },
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        include: [
          {
            model: Contact,
            as: "contact",
            include: ["tags", "extraInfo"]
          },
          "queue",
          "tags",
          "user",
          {
            model: Whatsapp,
            as: "whatsapp",
            attributes: ["name", "id"]
          }
        ]
      },
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"],
        where: {
          companyId
        },
        required: false
      },
      {
        model: OldMessage,
        as: "oldMessages",
        where: {
          ticketId: messageData.ticketId
        },
        required: false
      }
    ]
  });

  await message.ticket.contact.update({ presence: "available" });
  await message.ticket.contact.reload();

  if (message.ticket.queueId !== null && message.queueId === null) {
    await message.update({ queueId: message.ticket.queueId });
  }

  if (!message) {
    throw new Error("ERR_CREATING_MESSAGE");
  }

  if (!(await checkCompanyCompliant(companyId))) {
    return message;
  }

  const io = getIO();

  if (!skipWebsocket) {
    void websocketCreateMessage(message).catch(error => {
      logger.error(
        {
          error,
          step: "websocket_message_create",
          ticketId: message.ticketId,
          messageId: message.id,
          companyId
        },
        "Failed to emit created message"
      );
    });
  }

  io.to(`company-${companyId}-mainchannel`).emit(
    `company-${companyId}-contact`,
    {
      action: "update",
      contact: message.ticket.contact
    }
  );
  logger.debug(
    {
      company: companyId,
      ticket: message.ticketId,
      queue: message.ticket.queueId,
      status: message.ticket.status
    },
    "sending appMessage event"
  );

  if (!message.fromMe && message.ticket && shouldRunCopilot(message.ticket)) {
    void generateCopilotSuggestion({ ticket: message.ticket }).catch(error => {
      logger.warn(
        { error, ticketId: message.ticketId },
        "Copilot suggestion generation failed"
      );
    });
  }

  return message;
};

export default CreateMessageService;
