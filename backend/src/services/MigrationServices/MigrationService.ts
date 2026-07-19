import fs from "fs";
import path from "path";
import { Sequelize } from "sequelize";
import sequelize from "../../database";
import { logger } from "../../utils/logger";
import { applyAiSchema, isAiSchemaApplied } from "./ApplyAiSchemaService";

const getMigrationsDir = (): string => {
  const candidates = [
    path.join(__dirname, "../../database/migrations"),
    path.join(__dirname, "../../../src/database/migrations")
  ];

  const found = candidates.find(dir => fs.existsSync(dir));
  if (!found) {
    throw new Error("Migrations directory not found");
  }

  return found;
};

const getSchema = (): string => process.env.DB_SCHEMA || "ticketz";

const AI_MIGRATION_NAMES = new Set([
  "20260707100000-create-ai-and-knowledge-tables",
  "20260708120000-add-ai-agent-ack-fields",
  "20260709120000-add-ai-operational-flow-fields",
  "20260710120000-add-ai-professional-features",
  "20260711120000-ai-gen2-intelligence",
  "20260718100000-ai-phase1-orchestrator",
  "20260725100000-ai-phase2-knowledge-cms",
  "20260730100000-ai-phase3-memory-tools",
  "20260815100000-ai-phase4-operations-observability",
  "20260818100000-ai-phase34-consolidation",
  "20260719100000-ai-triage-v2-professional-flow"
]);

const listMigrationFiles = (): string[] => {
  const dir = getMigrationsDir();
  return fs
    .readdirSync(dir)
    .filter(file => file.endsWith(".js") || file.endsWith(".ts"))
    .sort();
};

const normalizeMigrationName = (name: string): string =>
  name.replace(/\.(js|ts)$/, "");

const getExecutedMigrations = async (): Promise<Set<string>> => {
  const schema = getSchema();

  try {
    const [rows] = await sequelize.query(
      `SELECT name FROM "${schema}"."SequelizeMeta" ORDER BY name`
    );

    return new Set(
      (rows as { name: string }[]).map(row => normalizeMigrationName(row.name))
    );
  } catch (error) {
    logger.warn(
      { error },
      "SequelizeMeta table not found — treating all migrations as pending"
    );
    return new Set();
  }
};

export const getPendingMigrations = async (): Promise<string[]> => {
  const executed = await getExecutedMigrations();
  return listMigrationFiles()
    .map(file => normalizeMigrationName(file))
    .filter(name => !executed.has(name));
};

export const getAiPendingMigrations = async (): Promise<string[]> => {
  const pending = await getPendingMigrations();
  return pending.filter(name => AI_MIGRATION_NAMES.has(name));
};

export const isAiSchemaReady = async (): Promise<boolean> =>
  isAiSchemaApplied();

const runMigrationBatch = async (pending: string[]): Promise<string[]> => {
  const dir = getMigrationsDir();
  const schema = getSchema();
  const applied: string[] = [];

  if (!pending.length) {
    return applied;
  }

  const queryInterface = sequelize.getQueryInterface();

  for (let i = 0; i < pending.length; i += 1) {
    const name = pending[i];
    const jsFile = `${name}.js`;
    const tsFile = `${name}.ts`;
    const filePath = fs.existsSync(path.join(dir, jsFile))
      ? path.join(dir, jsFile)
      : path.join(dir, tsFile);
    const storageName = path.basename(filePath);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const migration = require(filePath);
    const runUp = migration.default?.up || migration.up;

    if (typeof runUp !== "function") {
      throw new Error(`Migration ${name} does not export an up() function`);
    }

    await runUp(queryInterface, Sequelize);
    await sequelize.query(
      `INSERT INTO "${schema}"."SequelizeMeta" (name) VALUES (:name)`,
      {
        replacements: { name: storageName }
      }
    );

    applied.push(name);
    logger.info({ migration: name }, "Migration applied");
  }

  return applied;
};

export const runPendingMigrations = async (): Promise<string[]> => {
  const pending = await getPendingMigrations();
  return runMigrationBatch(pending);
};

export const runAiMigrations = async (): Promise<string[]> => {
  const pending = await getAiPendingMigrations();
  return runMigrationBatch(pending);
};

export const ensureAiSchemaReady = async (): Promise<{
  ready: boolean;
  applied: string[];
  pending: string[];
}> => {
  if (await isAiSchemaReady()) {
    return { ready: true, applied: [], pending: [] };
  }

  if (process.env.AUTO_MIGRATE !== "true") {
    const pending = await getAiPendingMigrations();
    return { ready: false, applied: [], pending };
  }

  try {
    await applyAiSchema();
    const ready = await isAiSchemaReady();
    const pending = ready ? [] : await getAiPendingMigrations();
    return {
      ready,
      applied: ready
        ? [
            "20260707100000-create-ai-and-knowledge-tables",
            "20260708120000-add-ai-agent-ack-fields"
          ]
        : [],
      pending
    };
  } catch (error) {
    logger.error({ error }, "Failed to apply AI schema");
    return {
      ready: false,
      applied: [],
      pending: await getAiPendingMigrations()
    };
  }
};

export const initializeMigrations = async (): Promise<{
  pending: string[];
  applied: string[];
  autoMigrateEnabled: boolean;
}> => {
  const autoMigrateEnabled = process.env.AUTO_MIGRATE === "true";
  let pending = await getPendingMigrations();
  let applied: string[] = [];

  if (autoMigrateEnabled && !(await isAiSchemaReady())) {
    try {
      await applyAiSchema();
      applied = [
        "20260707100000-create-ai-and-knowledge-tables",
        "20260708120000-add-ai-agent-ack-fields"
      ];
    } catch (error) {
      logger.error({ error }, "AI schema bootstrap failed");
    }
    pending = await getPendingMigrations();
  }

  const aiPending = pending.filter(name => AI_MIGRATION_NAMES.has(name));

  if (aiPending.length && autoMigrateEnabled) {
    logger.warn(
      { count: aiPending.length, migrations: aiPending },
      "AI schema still pending after ensure step"
    );
    pending = await getPendingMigrations();
  } else if (aiPending.length) {
    logger.error(
      { pending: aiPending },
      "Pending AI migrations detected — AI write operations disabled until migrations run. Set AUTO_MIGRATE=true to apply automatically on startup."
    );
  }

  return { pending, applied, autoMigrateEnabled };
};
