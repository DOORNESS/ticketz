import { Transaction } from "sequelize";
import sequelize from "../../database";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import AiConversationLog from "../../models/AiConversationLog";
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
  `"ContactAiMemoryLogs"`,
  `"ContactAiMemoryJobs"`,
  `"ContactAiMemories"`,
  `"AiToolExecutionLogs"`,
  `"AiToolIdempotencyRecords"`,
  `"MessageMediaFiles"`,
  `"MediaDeletionAudits"`,
  `"AiTicketTimelineEvents"`,
  `"AiKnowledgeSuggestions"`,
  `"AiCopilotSuggestions"`,
  `"AiReplayLogs"`,
  `"AiConversationLogs"`,
  `"AiRoutingLogs"`,
  `"ContentRepositoryUsageLogs"`
];

const TICKET_SCOPED_SQL_DELETES = [
  `"TicketTraking"`,
  `"TicketTags"`,
  `"TicketNotes"`,
  `"UserRatings"`,
  `"Schedules"`
];

const isMissingTableError = (error: unknown): boolean => {
  const code = (error as { parent?: { code?: string } })?.parent?.code;
  return code === "42P01";
};

const safeSql = async (
  step: string,
  sql: string,
  replacements: Record<string, unknown>,
  transaction: Transaction
): Promise<void> => {
  const savepoint = `reset_${step.replace(/[^a-zA-Z0-9_]/g, "_")}`;

  try {
    await sequelize.query(`SAVEPOINT ${savepoint}`, { transaction });
    await sequelize.query(sql, { replacements, transaction });
    await sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
  } catch (error) {
    if (isMissingTableError(error)) {
      await sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, {
        transaction
      });
      logger.warn({ step }, "Reset skipped optional SQL table");
      return;
    }

    try {
      await sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, {
        transaction
      });
    } catch (rollbackError) {
      logger.warn({ step, rollbackError }, "Reset savepoint rollback failed");
    }

    throw error;
  }
};

const deleteFromTableByCompany = async (
  step: string,
  tableName: string,
  companyId: number,
  transaction: Transaction
): Promise<void> => {
  await safeSql(
    step,
    `DELETE FROM ${tableName} WHERE "companyId" = :companyId`,
    { companyId },
    transaction
  );
};

const deleteFromTableByCompanyTickets = async (
  step: string,
  tableName: string,
  companyId: number,
  transaction: Transaction
): Promise<void> => {
  await safeSql(
    step,
    `
      DELETE FROM ${tableName}
      WHERE "ticketId" IN (
        SELECT "id" FROM "Tickets" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );
};

const deleteFromTableByCompanyContacts = async (
  step: string,
  tableName: string,
  companyId: number,
  transaction: Transaction
): Promise<void> => {
  await safeSql(
    step,
    `
      DELETE FROM ${tableName}
      WHERE "contactId" IN (
        SELECT "id" FROM "Contacts" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );
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
    let cleared = 0;
    await patterns.reduce(async (prev, pattern) => {
      await prev;
      cleared += await clearPattern(pattern);
    }, Promise.resolve());
    return cleared;
  } catch (error) {
    logger.warn({ error }, "Failed to clear AI redis state during reset");
    return 0;
  }
};

const runCompanyScopedSqlDeletes = async (
  companyId: number,
  transaction: Transaction
): Promise<void> => {
  await COMPANY_SCOPED_SQL_DELETES.reduce(async (prev, tableName) => {
    await prev;
    await deleteFromTableByCompany(
      tableName,
      tableName,
      companyId,
      transaction
    );
  }, Promise.resolve());
};

const wipeTicketRelatedData = async (
  companyId: number,
  transaction: Transaction
): Promise<{ messagesDeleted: number; aiLogsDeleted: number }> => {
  const messagesDeleted = await Message.count({
    where: { companyId },
    transaction
  });
  const aiLogsDeleted = await AiConversationLog.count({
    where: { companyId },
    transaction
  });

  await runCompanyScopedSqlDeletes(companyId, transaction);

  await safeSql(
    "OutOfTicketMessagesByWhatsapp",
    `
      DELETE FROM "OutOfTicketMessages"
      WHERE "whatsappId" IN (
        SELECT "id" FROM "Whatsapps" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await safeSql(
    "OldMessagesByTicket",
    `
      DELETE FROM "OldMessages"
      WHERE "ticketId" IN (
        SELECT "id" FROM "Tickets" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await safeSql(
    "OldMessagesByMessage",
    `
      DELETE FROM "OldMessages"
      WHERE "messageId" IN (
        SELECT "id" FROM "Messages" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await safeSql(
    "MessagesClearQuotes",
    `UPDATE "Messages" SET "quotedMsgId" = NULL WHERE "companyId" = :companyId`,
    { companyId },
    transaction
  );

  await safeSql(
    "TicketNotesByCompany",
    `
      DELETE FROM "TicketNotes"
      WHERE "ticketId" IN (SELECT "id" FROM "Tickets" WHERE "companyId" = :companyId)
         OR "contactId" IN (SELECT "id" FROM "Contacts" WHERE "companyId" = :companyId)
    `,
    { companyId },
    transaction
  );

  await safeSql(
    "MessagesByCompany",
    `DELETE FROM "Messages" WHERE "companyId" = :companyId`,
    { companyId },
    transaction
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

  await safeSql(
    "OldMessagesResidual",
    `
      DELETE FROM "OldMessages"
      WHERE "ticketId" IN (
        SELECT "id" FROM "Tickets" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await TICKET_SCOPED_SQL_DELETES.reduce(async (prev, tableName) => {
    await prev;
    await deleteFromTableByCompanyTickets(
      tableName,
      tableName,
      companyId,
      transaction
    );
  }, Promise.resolve());

  return { messagesDeleted, aiLogsDeleted };
};

const wipeCompanyContacts = async (
  companyId: number,
  transaction: Transaction
): Promise<number> => {
  const contactsDeleted = await Contact.count({
    where: { companyId },
    transaction
  });

  if (!contactsDeleted) {
    return 0;
  }

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

  await deleteFromTableByCompanyContacts(
    "ContactCustomFieldsByCompany",
    `"ContactCustomFields"`,
    companyId,
    transaction
  );
  await deleteFromTableByCompanyContacts(
    "ContactTagsByCompany",
    `"ContactTags"`,
    companyId,
    transaction
  );
  await deleteFromTableByCompanyContacts(
    "SchedulesByContact",
    `"Schedules"`,
    companyId,
    transaction
  );

  await safeSql(
    "TicketNotesByContact",
    `
      DELETE FROM "TicketNotes"
      WHERE "contactId" IN (
        SELECT "id" FROM "Contacts" WHERE "companyId" = :companyId
      )
    `,
    { companyId },
    transaction
  );

  await deleteFromTableByCompany(
    "WhatsappLidMapsByCompany",
    `"WhatsappLidMaps"`,
    companyId,
    transaction
  );

  await deleteFromTableByCompanyContacts(
    "ContactAiMemoryLogsByContact",
    `"ContactAiMemoryLogs"`,
    companyId,
    transaction
  );
  await deleteFromTableByCompanyContacts(
    "ContactAiMemoryJobsByContact",
    `"ContactAiMemoryJobs"`,
    companyId,
    transaction
  );
  await deleteFromTableByCompanyContacts(
    "ContactAiMemoriesByContact",
    `"ContactAiMemories"`,
    companyId,
    transaction
  );

  await Contact.destroy({
    where: { companyId },
    transaction
  });

  return contactsDeleted;
};

export const resetTestEnvironmentForCompany = async (
  companyId: number,
  options: ResetOptions = {}
): Promise<ResetSummary> => {
  const wipeContacts = options.wipeContacts === true;

  const summary = await sequelize.transaction(async transaction => {
    const { messagesDeleted, aiLogsDeleted } = await wipeTicketRelatedData(
      companyId,
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

  try {
    const { getIO } = await import("../../libs/socket");
    const io = getIO();
    io.to(`company-${companyId}-mainchannel`).emit(
      `company-${companyId}-ticket`,
      {
        action: "wipe",
        summary
      }
    );
  } catch (socketError) {
    logger.warn(
      { socketError, companyId },
      "Failed to broadcast wipe event over socket"
    );
  }

  return summary;
};
