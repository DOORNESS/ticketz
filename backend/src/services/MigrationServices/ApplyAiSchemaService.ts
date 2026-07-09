import sequelize from "../../database";
import { logger } from "../../utils/logger";

const getSchema = (): string => process.env.DB_SCHEMA || "ticketz";

const q = (schema: string, table: string): string => `"${schema}"."${table}"`;

const markMigrationExecuted = async (
  schema: string,
  name: string
): Promise<void> => {
  await sequelize.query(
    `
    INSERT INTO ${q(schema, "SequelizeMeta")} (name)
    SELECT :name
    WHERE NOT EXISTS (
      SELECT 1 FROM ${q(schema, "SequelizeMeta")}
      WHERE name = :name
    )
    `,
    { replacements: { name } }
  );
};

const ensurePgVector = async (): Promise<void> => {
  const [rows] = await sequelize.query(
    "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
  );

  if ((rows as unknown[]).length) {
    return;
  }

  try {
    await sequelize.query(
      "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions"
    );
  } catch {
    await sequelize.query("CREATE EXTENSION IF NOT EXISTS vector");
  }
};

const ensureTicketAiColumns = async (schema: string): Promise<void> => {
  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiHandoff" BOOLEAN NOT NULL DEFAULT false;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiAgentId" INTEGER;
  `);
};

const ensureOperationalFlowColumns = async (schema: string): Promise<void> => {
  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiHandoffReason" VARCHAR(64);
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiPaused" BOOLEAN NOT NULL DEFAULT false;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiResolvedByAi" BOOLEAN NOT NULL DEFAULT false;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiHandoffAt" TIMESTAMPTZ;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiWaitingSince" TIMESTAMPTZ;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiStartedAt" TIMESTAMPTZ;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Tickets")}
    ADD COLUMN IF NOT EXISTS "aiSlaBreached" BOOLEAN NOT NULL DEFAULT false;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Queues")}
    ADD COLUMN IF NOT EXISTS "slaSeconds" INTEGER;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "Queues")}
    ADD COLUMN IF NOT EXISTS "slaSupervisorEscalationSeconds" INTEGER;
  `);
};

const ensureAiTables = async (schema: string): Promise<void> => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "AiAgents")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      provider VARCHAR(255) NOT NULL DEFAULT 'openai',
      "textModel" VARCHAR(255) NOT NULL DEFAULT 'gpt-4o-mini',
      "visionModel" VARCHAR(255) NOT NULL DEFAULT 'gpt-4o-mini',
      "transcriptionModel" VARCHAR(255) NOT NULL DEFAULT 'gpt-4o-mini-transcribe',
      "basePrompt" TEXT,
      temperature DOUBLE PRECISION NOT NULL DEFAULT 0.3,
      "maxTokens" INTEGER NOT NULL DEFAULT 1024,
      "fallbackQueueId" INTEGER REFERENCES ${q(schema, "Queues")}(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      "handoffMessage" TEXT,
      "ackEnabled" BOOLEAN NOT NULL DEFAULT false,
      "ackMessage" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "AiAgentQueues")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "aiAgentId" INTEGER NOT NULL REFERENCES ${q(schema, "AiAgents")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "queueId" INTEGER NOT NULL REFERENCES ${q(schema, "Queues")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "knowledgeBaseId" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ai_agent_queues_unique UNIQUE ("aiAgentId", "queueId")
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "KnowledgeBases")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "KnowledgeDocuments")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "knowledgeBaseId" INTEGER NOT NULL REFERENCES ${q(schema, "KnowledgeBases")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      type VARCHAR(255) NOT NULL DEFAULT 'text',
      "originalFilename" VARCHAR(255),
      "storageUrl" TEXT,
      status VARCHAR(255) NOT NULL DEFAULT 'pending',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "KnowledgeChunks")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "knowledgeDocumentId" INTEGER NOT NULL REFERENCES ${q(schema, "KnowledgeDocuments")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      content TEXT NOT NULL,
      metadata JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    DO $$
    BEGIN
      ALTER TABLE ${q(schema, "KnowledgeChunks")}
      ADD COLUMN embedding vector(1536);
    EXCEPTION
      WHEN duplicate_column THEN NULL;
    END $$;
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_company_idx
    ON ${q(schema, "KnowledgeChunks")} ("companyId");
  `);

  await sequelize.query(`
    DO $$
    BEGIN
      CREATE INDEX knowledge_chunks_embedding_idx
      ON ${q(schema, "KnowledgeChunks")}
      USING hnsw (embedding vector_cosine_ops);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'knowledge_chunks_embedding_idx skipped: %', SQLERRM;
    END $$;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "AiConversationLogs")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "ticketId" INTEGER REFERENCES ${q(schema, "Tickets")}(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      "messageId" VARCHAR(255),
      direction VARCHAR(255) NOT NULL DEFAULT 'inbound',
      "userMessage" TEXT,
      "aiResponse" TEXT,
      "usedChunks" JSONB,
      model VARCHAR(255),
      "tokensInput" INTEGER,
      "tokensOutput" INTEGER,
      "transferredToHuman" BOOLEAN NOT NULL DEFAULT false,
      error TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${q(schema, "MessageMediaFiles")} (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES ${q(schema, "Companies")}(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      "ticketId" INTEGER REFERENCES ${q(schema, "Tickets")}(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      "messageId" VARCHAR(255),
      "mediaType" VARCHAR(255),
      "mimeType" VARCHAR(255),
      "originalFilename" VARCHAR(255),
      "sizeBytes" BIGINT,
      "storageProvider" VARCHAR(255) NOT NULL DEFAULT 'backblaze',
      "storageKey" TEXT,
      bucket VARCHAR(255),
      "publicUrl" TEXT,
      hash VARCHAR(255),
      "transcriptionText" TEXT,
      "visionSummary" TEXT,
      "uploadedByUserId" INTEGER REFERENCES ${q(schema, "Users")}(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS ai_agents_company_active_idx
    ON ${q(schema, "AiAgents")} ("companyId", active);
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS knowledge_bases_company_active_idx
    ON ${q(schema, "KnowledgeBases")} ("companyId", active);
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS ai_conversation_logs_company_created_idx
    ON ${q(schema, "AiConversationLogs")} ("companyId", "createdAt");
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS message_media_files_company_ticket_idx
    ON ${q(schema, "MessageMediaFiles")} ("companyId", "ticketId");
  `);
};

const ensureAckColumns = async (schema: string): Promise<void> => {
  await sequelize.query(`
    ALTER TABLE ${q(schema, "AiAgents")}
    ADD COLUMN IF NOT EXISTS "ackEnabled" BOOLEAN NOT NULL DEFAULT false;
  `);

  await sequelize.query(`
    ALTER TABLE ${q(schema, "AiAgents")}
    ADD COLUMN IF NOT EXISTS "ackMessage" TEXT;
  `);
};

export const applyAiSchema = async (): Promise<void> => {
  const schema = getSchema();

  await ensurePgVector();
  await ensureTicketAiColumns(schema);
  await ensureOperationalFlowColumns(schema);
  await ensureAiTables(schema);
  await ensureAckColumns(schema);

  await markMigrationExecuted(
    schema,
    "20260707100000-create-ai-and-knowledge-tables.js"
  );
  await markMigrationExecuted(
    schema,
    "20260708120000-add-ai-agent-ack-fields.js"
  );
  await markMigrationExecuted(
    schema,
    "20260709120000-add-ai-operational-flow-fields.js"
  );

  logger.info({ schema }, "AI schema ensured");
};

export const isAiSchemaApplied = async (): Promise<boolean> => {
  const schema = getSchema();

  try {
    const [tableRows] = await sequelize.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = :schema
        AND table_name IN (
          'AiAgents',
          'AiAgentQueues',
          'KnowledgeBases',
          'KnowledgeDocuments',
          'KnowledgeChunks',
          'AiConversationLogs',
          'MessageMediaFiles'
        )
      `,
      { replacements: { schema } }
    );

    if ((tableRows as { table_name: string }[]).length < 7) {
      return false;
    }

    const [ticketColumns] = await sequelize.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = :schema
        AND table_name = 'Tickets'
        AND column_name IN ('aiHandoff', 'aiAgentId')
      `,
      { replacements: { schema } }
    );

    if ((ticketColumns as { column_name: string }[]).length < 2) {
      return false;
    }

    const [ackColumns] = await sequelize.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = :schema
        AND table_name = 'AiAgents'
        AND column_name IN ('ackEnabled', 'ackMessage')
      `,
      { replacements: { schema } }
    );

    return (ackColumns as { column_name: string }[]).length === 2;
  } catch (error) {
    logger.warn({ error }, "Failed to verify AI schema");
    return false;
  }
};
