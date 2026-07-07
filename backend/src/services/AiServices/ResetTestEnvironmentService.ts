import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import OldMessage from "../../models/OldMessage";
import TicketTraking from "../../models/TicketTraking";
import TicketTag from "../../models/TicketTag";
import TicketNote from "../../models/TicketNote";
import UserRating from "../../models/UserRating";
import AiConversationLog from "../../models/AiConversationLog";
import MessageMediaFile from "../../models/MessageMediaFile";
import { getAiInboundQueue } from "./AiInboundQueueService";
import { logger } from "../../utils/logger";

type ResetSummary = {
  companyId: number;
  ticketsDeleted: number;
  messagesDeleted: number;
  aiLogsDeleted: number;
  redisKeysCleared: number;
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

export const resetTestEnvironmentForCompany = async (
  companyId: number
): Promise<ResetSummary> => {
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
    aiLogsDeleted = await AiConversationLog.destroy({
      where: { companyId }
    });
    await MessageMediaFile.destroy({
      where: { companyId }
    });
  } else {
    aiLogsDeleted = await AiConversationLog.destroy({
      where: { companyId }
    });
    await MessageMediaFile.destroy({
      where: { companyId }
    });
  }

  const ticketsDeleted = await Ticket.destroy({
    where: { companyId }
  });

  const redisKeysCleared = await clearAiRedisState();

  const summary: ResetSummary = {
    companyId,
    ticketsDeleted,
    messagesDeleted,
    aiLogsDeleted,
    redisKeysCleared
  };

  logger.info({ summary }, "Test environment reset completed");
  return summary;
};
