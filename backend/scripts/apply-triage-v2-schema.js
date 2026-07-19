"use strict";
/**
 * Aplica schema triage v2 via SQL idempotente (homolog/prod ops).
 */
require("../dist/bootstrap");
const sequelize = require("../dist/database").default;

const schema = process.env.DB_SCHEMA || "ticketz";

const statements = [
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiHandoffMode" VARCHAR(32)`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiHandoffOriginalReason" VARCHAR(64)`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiCaseCompleteness" JSONB`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiInvestigationRound" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiCorrelationId" VARCHAR(64)`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiProcessingState" VARCHAR(32)`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiSkipLegacyOutOfHoursOnHandoff" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiAssistActive" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiAssistMode" VARCHAR(32)`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiAssistRequestedAt" TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiAssistRequestedBy" INTEGER`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiAssistAgentId" INTEGER`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiHumanAssumedAt" TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE "${schema}"."Tickets" ADD COLUMN IF NOT EXISTS "aiHumanAssumedBy" INTEGER`,
  `ALTER TABLE "${schema}"."Messages" ADD COLUMN IF NOT EXISTS "transcriptionStatus" VARCHAR(32)`,
  `ALTER TABLE "${schema}"."Messages" ADD COLUMN IF NOT EXISTS "transcriptionText" TEXT`,
  `ALTER TABLE "${schema}"."Messages" ADD COLUMN IF NOT EXISTS "transcriptionRequestedBy" INTEGER`,
  `ALTER TABLE "${schema}"."Messages" ADD COLUMN IF NOT EXISTS "transcriptionReason" VARCHAR(64)`,
  `ALTER TABLE "${schema}"."Messages" ADD COLUMN IF NOT EXISTS "aiProcessedAt" TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE "${schema}"."Messages" ADD COLUMN IF NOT EXISTS "aiReadAt" TIMESTAMP WITH TIME ZONE`,
  `
  CREATE TABLE IF NOT EXISTS "${schema}"."AiTicketTimelineEvents" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "${schema}"."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "ticketId" INTEGER NOT NULL REFERENCES "${schema}"."Tickets"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "eventType" VARCHAR(64) NOT NULL,
    stage VARCHAR(64),
    operation VARCHAR(64),
    "correlationId" VARCHAR(64),
    "messageId" VARCHAR(255),
    "agentId" INTEGER,
    "errorClass" VARCHAR(64),
    details JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  )
  `,
  `CREATE INDEX IF NOT EXISTS "ai_ticket_timeline_company_ticket_created" ON "${schema}"."AiTicketTimelineEvents" ("companyId", "ticketId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ai_ticket_timeline_correlation" ON "${schema}"."AiTicketTimelineEvents" ("correlationId")`
];

const run = async () => {
  for (const sql of statements) {
    await sequelize.query(sql);
  }

  const [rows] = await sequelize.query(
    `
    SELECT name FROM "${schema}"."SequelizeMeta"
    WHERE name = '20260719100000-ai-triage-v2-professional-flow.js'
    `
  );

  if (!rows.length) {
    await sequelize.query(
      `
      INSERT INTO "${schema}"."SequelizeMeta" (name)
      VALUES ('20260719100000-ai-triage-v2-professional-flow.js')
      `
    );
  }

  console.log(JSON.stringify({ ok: true, applied: true, schema }));
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
