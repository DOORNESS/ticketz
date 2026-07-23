import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import OldMessage from "../../models/OldMessage";
import TicketTraking from "../../models/TicketTraking";
import TicketTag from "../../models/TicketTag";
import TicketNote from "../../models/TicketNote";
import UserRating from "../../models/UserRating";
import AiConversationLog from "../../models/AiConversationLog";
import AiReplayLog from "../../models/AiReplayLog";
import MessageMediaFile from "../../models/MessageMediaFile";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import ContactTag from "../../models/ContactTag";
import Schedule from "../../models/Schedule";
import WhatsappLidMap from "../../models/WhatsappLidMap";
import ContactAiMemory from "../../models/ContactAiMemory";
import ContactAiMemoryJob from "../../models/ContactAiMemoryJob";
import ContactAiMemoryLog from "../../models/ContactAiMemoryLog";
import AiToolExecutionLog from "../../models/AiToolExecutionLog";
import AiToolIdempotencyRecord from "../../models/AiToolIdempotencyRecord";
import { getAiInboundQueue } from "./AiInboundQueueService";
import { logger } from "../../utils/logger";

export type ResetSummary = {
  companyId: number;
  ticketsDeleted: number;
  messagesDeleted: number;
  aiLogsDeleted: number;
  contactsDeleted: number;
  redisKeysCleared: number;
};

export type ResetOptions = {
  wipeContacts?: boolean;
};

const clearPattern = async (pattern: string): Promise<number> => {
  const redis = getAiInboundQueue().client;
  const stream = redis.scanStream({ match: pattern, count: 100 });
  const keys: string[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (resultKeys: string[]) => {
      keys.push(...resultKeys);
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  if (!keys.length) {
    return 0;
  }

  await redis.del(...keys);
  return keys.length;
};

const clearAiRedisState = async (): Promise<number> => {
  try {
    const patterns = ["ai:buffer:*", "ai:lock:*", "ai:ack:sent:*"];
    const clearedCounts = await Promise.all(patterns.map(clearPattern));
    return clearedCounts.reduce((total, count) => total + count, 0);
  } catch (error) {
    logger.warn({ error }, "Failed to clear AI redis state during reset");
    return 0;
  }
};

const wipeCompanyContacts = async (companyId: number): Promise<number> => {
  const contacts = await Contact.findAll({
    where: { companyId },
    attributes: ["id"]
  });
  const contactIds = contacts.map(contact => contact.id);

  if (!contactIds.length) {
    return 0;
  }

  await ContactCustomField.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await ContactTag.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await Schedule.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await WhatsappLidMap.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await ContactAiMemoryLog.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await ContactAiMemoryJob.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await ContactAiMemory.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });
  await AiToolExecutionLog.destroy({
    where: { companyId, contactId: { [Op.in]: contactIds } }
  });
  await AiToolIdempotencyRecord.destroy({
    where: { companyId, contactId: { [Op.in]: contactIds } }
  });
  await TicketNote.destroy({
    where: { contactId: { [Op.in]: contactIds } }
  });

  return Contact.destroy({
    where: { companyId }
  });
};

export const resetTestEnvironmentForCompany = async (
  companyId: number,
  options: ResetOptions = {}
): Promise<ResetSummary> => {
  const wipeContacts = options.wipeContacts === true;

  const tickets = await Ticket.findAll({
    where: { companyId },
    attributes: ["id"]
  });
  const ticketIds = tickets.map(ticket => ticket.id);

  let messagesDeleted = 0;
  let aiLogsDeleted = 0;

  if (ticketIds.length) {
    messagesDeleted = await Message.destroy({
      where: { ticketId: { [Op.in]: ticketIds } }
    });
    await OldMessage.destroy({
      where: { ticketId: { [Op.in]: ticketIds } }
    });
    await TicketTraking.destroy({
      where: { ticketId: { [Op.in]: ticketIds } }
    });
    await TicketTag.destroy({
      where: { ticketId: { [Op.in]: ticketIds } }
    });
    await TicketNote.destroy({
      where: { ticketId: { [Op.in]: ticketIds } }
    });
    await UserRating.destroy({
      where: { ticketId: { [Op.in]: ticketIds } }
    });
  }

  aiLogsDeleted = await AiConversationLog.destroy({
    where: { companyId }
  });
  await AiReplayLog.destroy({
    where: { companyId }
  });
  await MessageMediaFile.destroy({
    where: { companyId }
  });

  const ticketsDeleted = await Ticket.destroy({
    where: { companyId }
  });

  const contactsDeleted = wipeContacts
    ? await wipeCompanyContacts(companyId)
    : 0;

  const redisKeysCleared = await clearAiRedisState();

  const summary: ResetSummary = {
    companyId,
    ticketsDeleted,
    messagesDeleted,
    aiLogsDeleted,
    contactsDeleted,
    redisKeysCleared
  };

  logger.info({ summary, wipeContacts }, "Test environment reset completed");
  return summary;
};
