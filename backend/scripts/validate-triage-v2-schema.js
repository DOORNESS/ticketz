"use strict";
/**
 * Evidência SQL do schema triage v2.
 *   node scripts/validate-triage-v2-schema.js
 */
require("../dist/bootstrap");
const sequelize = require("../dist/database").default;

const schema = process.env.DB_SCHEMA || "ticketz";

const run = async () => {
  const ticketColumns = [
    "aiHandoffMode",
    "aiHandoffOriginalReason",
    "aiCaseCompleteness",
    "aiInvestigationRound",
    "aiCorrelationId",
    "aiProcessingState",
    "aiSkipLegacyOutOfHoursOnHandoff",
    "aiAssistActive",
    "aiAssistMode",
    "aiAssistRequestedAt",
    "aiAssistRequestedBy",
    "aiAssistAgentId",
    "aiHumanAssumedAt",
    "aiHumanAssumedBy"
  ];

  const messageColumns = [
    "transcriptionStatus",
    "transcriptionText",
    "transcriptionRequestedBy",
    "transcriptionReason",
    "aiProcessedAt",
    "aiReadAt"
  ];

  const [ticketCols] = await sequelize.query(
    `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = :schema AND table_name = 'Tickets'
      AND column_name IN (:ticketColumns)
    ORDER BY column_name
    `,
    { replacements: { schema, ticketColumns } }
  );

  const [messageCols] = await sequelize.query(
    `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = :schema AND table_name = 'Messages'
      AND column_name IN (:messageColumns)
    ORDER BY column_name
    `,
    { replacements: { schema, messageColumns } }
  );

  const [timelineTable] = await sequelize.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = :schema AND table_name = 'AiTicketTimelineEvents'
    `,
    { replacements: { schema } }
  );

  const [timelineIndexes] = await sequelize.query(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = :schema AND tablename = 'AiTicketTimelineEvents'
    ORDER BY indexname
    `,
    { replacements: { schema } }
  );

  const [timelineFks] = await sequelize.query(
    `
    SELECT conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = :schema AND t.relname = 'AiTicketTimelineEvents' AND c.contype = 'f'
    `,
    { replacements: { schema } }
  );

  const [legacyTickets] = await sequelize.query(
    `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "aiHandoffMode" IS NULL)::int AS null_mode
    FROM "${schema}"."Tickets"
    `,
    { replacements: { schema } }
  );

  const report = {
    schema,
    tickets: {
      expected: ticketColumns.length,
      found: ticketCols.length,
      columns: ticketCols
    },
    messages: {
      expected: messageColumns.length,
      found: messageCols.length,
      columns: messageCols
    },
    aiTicketTimelineEvents: {
      exists: timelineTable.length > 0,
      indexes: timelineIndexes,
      foreignKeys: timelineFks
    },
    legacyCompatibility: legacyTickets[0],
    ok:
      ticketCols.length === ticketColumns.length &&
      messageCols.length === messageColumns.length &&
      timelineTable.length > 0
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
