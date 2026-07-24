import { Op, Transaction } from "sequelize";
import sequelize from "../../database";
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
import MediaDeletionAudit from "../../models/MediaDeletionAudit";
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
import AiTicketTimelineEvent from "../../models/AiTicketTimelineEvent";
import AiKnowledgeSuggestion from "../../models/AiKnowledgeSuggestion";
import AiCopilotSuggestion from "../../models/AiCopilotSuggestion";
import AiRoutingLog from "../../models/AiRoutingLog";
import ContentRepositoryUsageLog from "../../models/ContentRepositoryUsageLog";
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

const COMPANY_SCOPED_SQL_DELETES = [
  `"MessageMediaFiles"`,
  `"MediaDeletionAudits"`,
  `"AiTicketTimelineEvents"`,
  `"AiKnowledgeSuggestions"`,
  `"AiCopilotSuggestions"`,
  `"AiReplayLogs"`,
  `"AiConversationLogs"`,
  `"AiRoutingLogs"`,
  `"ContentRepositoryUsageLogs"`,
  `"AiToolExecutionLogs"`,
  `"AiToolIdempotencyRecords"`,
  `"ContactAiMemoryLogs"`,
  `"ContactAiMemoryJobs"`,
  `"ContactAiMemories"`
];

const isMissingTableError = (error: unknown): boolean => {
  const code = (error as { parent?: { code?: string } })?.parent?.code;
  return code === "42P01";
};

const safeDestroy = async (
  step: string,
  destroyFn: () => Promise<number>
): Promise<number> => {
  try {
    return await destroyFn();
  } catch (error) {
    if (isMissingTableError(error)) {
      logger.warn({ step }, "Reset skipped optional table");
      return 0;
    }
    throw error;
  }
};

const safeSql = async (
  step: string,
  sql: string,
  replacements: Record<string, unknown>,
  transaction: Transaction
): Promise<void> => {
  try {
    await sequelize.query(sql, { replacements, transaction });
  } catch (error) {
    if (isMissingTableError(error)) {
      logger.warn({ step }, "Reset skipped optional SQL table");
      return;
    }
    throw error;
  }
};

const destroyByCompany = async (
  model: { destroy: (options: object) => Promise<number> },
  companyId: number,
  transaction: Transaction
): Promise<number> =>
  model.destroy({
    where: { companyId },
    transaction
  });

const destroyByTicketIds = async (
  model: { destroy: (options: object) => Promise<number> },
  ticketIds: number[],
  transaction: Transaction
): Promise<number> => {
  if (!ticketIds.length) {
    return 0;
  }

  return model.destroy({
    where: { ticketId: { [Op.in]: ticketIds } },
    transaction
  });
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

const runCompanyScopedSqlDeletes = async (
  companyId: number,
  transaction: Transaction
): Promise<void> => {
  await Promise.all(
    COMPANY_SCOPED_SQL_DELETES.map(tableName =>
      safeSql(
        tableName,
        `DELETE FROM ${tableName} WHERE "companyId" = :companyId`,
        { companyId },
        transaction
      )
    )
  );
};

const wipeTicketRelatedData = async (
  companyId: number,
  ticketIds: number[],
  transaction: Transaction
): Promise<{ messagesDeleted: number; aiLogsDeleted: number }> => {
  await runCompanyScopedSqlDeletes(companyId, transaction);

  await safeDestroy("MessageMediaFile", () =>
    destroyByCompany(MessageMediaFile, companyId, transaction)
  );
  await safeDestroy("MediaDeletionAudit", () =>
    destroyByCompany(MediaDeletionAudit, companyId, transaction)
  );
  await safeDestroy("AiTicketTimelineEvent", () =>
    destroyByCompany(AiTicketTimelineEvent, companyId, transaction)
  );
  await safeDestroy("AiKnowledgeSuggestion", () =>
    destroyByCompany(AiKnowledgeSuggestion, companyId, transaction)
  );
  await safeDestroy("AiCopilotSuggestion", () =>
    destroyByCompany(AiCopilotSuggestion, companyId, transaction)
  );
  await safeDestroy("AiRoutingLog", () =>
    destroyByCompany(AiRoutingLog, companyId, transaction)
  );
  await safeDestroy("ContentRepositoryUsageLog", () =>
    destroyByCompany(ContentRepositoryUsageLog, companyId, transaction)
  );
  await safeDestroy("AiToolExecutionLog", () =>
    destroyByCompany(AiToolExecutionLog, companyId, transaction)
  );
  await safeDestroy("AiToolIdempotencyRecord", () =>
    destroyByCompany(AiToolIdempotencyRecord, companyId, transaction)
  );
  await safeDestroy("ContactAiMemoryJob", () =>
    destroyByCompany(ContactAiMemoryJob, companyId, transaction)
  );

  const aiLogsDeleted = await safeDestroy("AiConversationLog", () =>
    AiConversationLog.destroy({
      where: { companyId },
      transaction
    })
  );
  await safeDestroy("AiReplayLog", () =>
    AiReplayLog.destroy({
      where: { companyId },
      transaction
    })
  );

  let messagesDeleted = await destroyByTicketIds(
    Message,
    ticketIds,
    transaction
  );
  messagesDeleted += await safeDestroy("MessageByCompany", () =>
    Message.destroy({
      where: { companyId },
      transaction
    })
  );

  await safeSql(
    "MessagesByTicketSubquery",
    `
      DELETE FROM "Messages"
      WHERE "ticketId" IN (
        SELECT "id" FROM "Tickets" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await destroyByTicketIds(OldMessage, ticketIds, transaction);
  await destroyByTicketIds(TicketTraking, ticketIds, transaction);
  await destroyByTicketIds(TicketTag, ticketIds, transaction);
  await destroyByTicketIds(TicketNote, ticketIds, transaction);
  await destroyByTicketIds(UserRating, ticketIds, transaction);
  await destroyByTicketIds(Schedule, ticketIds, transaction);

  return { messagesDeleted, aiLogsDeleted };
};

const wipeCompanyContacts = async (
  companyId: number,
  transaction: Transaction
): Promise<number> => {
  const contacts = await Contact.findAll({
    where: { companyId },
    attributes: ["id"],
    transaction
  });
  const contactIds = contacts.map(contact => contact.id);

  if (!contactIds.length) {
    return 0;
  }

  const contactScope = { contactId: { [Op.in]: contactIds } };

  await safeSql(
    "MessagesByContact",
    `
      DELETE FROM "Messages"
      WHERE "contactId" IN (
        SELECT "id" FROM "Contacts" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await ContactCustomField.destroy({
    where: contactScope,
    transaction
  });
  await ContactTag.destroy({
    where: contactScope,
    transaction
  });
  await Schedule.destroy({
    where: contactScope,
    transaction
  });
  await WhatsappLidMap.destroy({
    where: { companyId },
    transaction
  });
  await safeDestroy("ContactAiMemoryLog", () =>
    destroyByCompany(ContactAiMemoryLog, companyId, transaction)
  );
  await safeDestroy("ContactAiMemoryJob", () =>
    destroyByCompany(ContactAiMemoryJob, companyId, transaction)
  );
  await safeDestroy("ContactAiMemory", () =>
    destroyByCompany(ContactAiMemory, companyId, transaction)
  );

  return Contact.destroy({
    where: { companyId },
    transaction
  });
};

export const resetTestEnvironmentForCompany = async (
  companyId: number,
  options: ResetOptions = {}
): Promise<ResetSummary> => {
  const wipeContacts = options.wipeContacts === true;

  const summary = await sequelize.transaction(async transaction => {
    const tickets = await Ticket.findAll({
      where: { companyId },
      attributes: ["id"],
      transaction
    });
    const ticketIds = tickets.map(ticket => ticket.id);

    const { messagesDeleted, aiLogsDeleted } = await wipeTicketRelatedData(
      companyId,
      ticketIds,
      transaction
    );

    const ticketsDeleted = await Ticket.destroy({
      where: { companyId },
      transaction
    });

    const contactsDeleted = wipeContacts
      ? await wipeCompanyContacts(companyId, transaction)
      : 0;

    return {
      companyId,
      ticketsDeleted,
      messagesDeleted,
      aiLogsDeleted,
      contactsDeleted,
      redisKeysCleared: 0
    };
  });

  summary.redisKeysCleared = await clearAiRedisState();

  logger.info({ summary, wipeContacts }, "Test environment reset completed");
  return summary;
};
