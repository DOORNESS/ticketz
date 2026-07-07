import sequelize from "../../database";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { loadStorageConfig } from "../StorageService/StorageConfigService";
import StorageService from "../StorageService/StorageService";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import AiConversationLog from "../../models/AiConversationLog";
import Whatsapp from "../../models/Whatsapp";
import { getPendingMigrations } from "../MigrationServices/MigrationService";
import { getAiQueueMetrics } from "./AiQueueMetricsService";
import { createEmbedding } from "./ModelGateway";
import { logger } from "../../utils/logger";

export type DiagnosticStatus = "ok" | "warning" | "error" | "unknown";

export type DiagnosticItem = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type AiDiagnosticsResult = {
  scope: "global" | "company";
  companyId?: number;
  overall: DiagnosticStatus;
  checkedAt: string;
  items: DiagnosticItem[];
  pendingMigrations: string[];
  warnings: string[];
  errors: string[];
  aiFeaturesEnabled: boolean;
};

const AI_TABLES = [
  "AiAgents",
  "AiAgentQueues",
  "KnowledgeBases",
  "KnowledgeDocuments",
  "KnowledgeChunks",
  "AiConversationLogs",
  "MessageMediaFiles"
];

const statusRank: Record<DiagnosticStatus, number> = {
  ok: 0,
  unknown: 1,
  warning: 2,
  error: 3
};

const mergeOverall = (items: DiagnosticItem[]): DiagnosticStatus => {
  if (!items.length) return "unknown";
  return items.reduce<DiagnosticStatus>((worst, item) => {
    return statusRank[item.status] > statusRank[worst] ? item.status : worst;
  }, "ok");
};

const item = (
  key: string,
  label: string,
  status: DiagnosticStatus,
  message: string,
  details?: Record<string, unknown>
): DiagnosticItem => ({ key, label, status, message, details });

const collectMessages = (
  items: DiagnosticItem[],
  status: DiagnosticStatus
): string[] =>
  items.filter(i => i.status === status).map(i => `${i.label}: ${i.message}`);

const checkDatabaseConnectivity = async (): Promise<DiagnosticItem> => {
  try {
    await sequelize.authenticate();
    return item("database", "Banco de dados", "ok", "Conexão estabelecida");
  } catch (error) {
    return item(
      "database",
      "Banco de dados",
      "error",
      `Falha na conexão: ${error?.message || "erro desconhecido"}`
    );
  }
};

const checkPgVector = async (): Promise<DiagnosticItem> => {
  try {
    const [rows] = await sequelize.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if ((rows as unknown[]).length) {
      const ext = rows[0] as { extname: string; extversion: string };
      return item(
        "pgvector",
        "pgvector",
        "ok",
        `Extensão habilitada (v${ext.extversion})`
      );
    }
    return item(
      "pgvector",
      "pgvector",
      "error",
      "Extensão vector não encontrada"
    );
  } catch (error) {
    return item(
      "pgvector",
      "pgvector",
      "error",
      error?.message || "Falha ao verificar pgvector"
    );
  }
};

const checkAiTables = async (): Promise<DiagnosticItem> => {
  try {
    const schema = process.env.DB_SCHEMA || "ticketz";
    const [rows] = await sequelize.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = :schema
        AND table_name IN (:tables)
      `,
      { replacements: { schema, tables: AI_TABLES } }
    );

    const found = new Set(
      (rows as { table_name: string }[]).map(row => row.table_name)
    );
    const missing = AI_TABLES.filter(name => !found.has(name));

    if (!missing.length) {
      return item(
        "ai_tables",
        "Tabelas da IA",
        "ok",
        `${AI_TABLES.length} tabelas encontradas`
      );
    }

    return item(
      "ai_tables",
      "Tabelas da IA",
      "error",
      `Tabelas ausentes: ${missing.join(", ")}`,
      { missing }
    );
  } catch (error) {
    return item(
      "ai_tables",
      "Tabelas da IA",
      "error",
      error?.message || "Falha ao verificar tabelas"
    );
  }
};

const checkVectorIndex = async (): Promise<DiagnosticItem> => {
  try {
    const schema = process.env.DB_SCHEMA || "ticketz";
    const [rows] = await sequelize.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = :schema
        AND tablename = 'KnowledgeChunks'
        AND indexdef ILIKE '%embedding%'
      `,
      { replacements: { schema } }
    );

    if ((rows as unknown[]).length) {
      return item(
        "vector_index",
        "Índice vetorial",
        "ok",
        "Índice de embeddings encontrado"
      );
    }

    return item(
      "vector_index",
      "Índice vetorial",
      "warning",
      "Índice HNSW/embedding não encontrado — busca pode ficar lenta"
    );
  } catch (error) {
    return item(
      "vector_index",
      "Índice vetorial",
      "warning",
      error?.message || "Não foi possível verificar índice"
    );
  }
};

const checkMigrations = async (): Promise<DiagnosticItem> => {
  const pending = await getPendingMigrations();
  if (!pending.length) {
    return item("migrations", "Migrations", "ok", "Banco atualizado");
  }

  return item(
    "migrations",
    "Migrations",
    "error",
    `${pending.length} migration(s) pendente(s)`,
    { pending }
  );
};

const checkStorage = async (companyId: number): Promise<DiagnosticItem> => {
  try {
    await StorageService.ensureReady(companyId);
    const config = await loadStorageConfig(companyId);
    const provider = StorageService.getProvider();

    if (config && provider !== "local") {
      return item(
        "storage",
        "Storage",
        "ok",
        `Provider ${provider} configurado (bucket: ${config.bucket})`,
        { provider, bucket: config.bucket, rootPrefix: config.rootPrefix }
      );
    }

    return item(
      "storage",
      "Storage",
      "warning",
      "Usando armazenamento local — configure B2/R2/S3 em Configurações → Armazenamento",
      { provider }
    );
  } catch (error) {
    return item(
      "storage",
      "Storage",
      "warning",
      error?.message || "Storage não configurado"
    );
  }
};

const checkProviderConfig = async (
  companyId: number
): Promise<DiagnosticItem> => {
  const provider = await GetCompanySetting(companyId, "aiProvider", "openai");
  const apiKey = await GetCompanySetting(companyId, "openAiKey", null);

  if (!apiKey) {
    return item(
      "provider_config",
      "Provider de IA",
      "error",
      "API Key não configurada em Configurações → Serviços externos"
    );
  }

  return item(
    "provider_config",
    `${provider} (configuração)`,
    "ok",
    "API Key configurada",
    { provider }
  );
};

const checkProviderConnectivity = async (
  companyId: number,
  live: boolean
): Promise<DiagnosticItem> => {
  const provider = await GetCompanySetting(companyId, "aiProvider", "openai");
  const apiKey = await GetCompanySetting(companyId, "openAiKey", null);

  if (!apiKey) {
    return item(
      "provider_live",
      `${provider} (conectividade)`,
      "error",
      "API Key ausente"
    );
  }

  if (!live) {
    return item(
      "provider_live",
      `${provider} (conectividade)`,
      "unknown",
      "Teste ao vivo disponível no botão 'Executar diagnóstico novamente'"
    );
  }

  try {
    await createEmbedding(companyId, "diagnostic ping", provider);
    return item(
      "provider_live",
      `${provider} (conectividade)`,
      "ok",
      "Provider respondeu com sucesso"
    );
  } catch (error) {
    return item(
      "provider_live",
      `${provider} (conectividade)`,
      "error",
      error?.message || "Falha ao contatar provider"
    );
  }
};

const checkEmbeddings = async (companyId: number): Promise<DiagnosticItem> => {
  try {
    const count = await KnowledgeChunk.count({ where: { companyId } });
    if (count > 0) {
      return item(
        "embeddings",
        "Embeddings",
        "ok",
        `${count} chunk(s) vetorizado(s)`,
        { count }
      );
    }
    return item(
      "embeddings",
      "Embeddings",
      "warning",
      "Nenhum embedding cadastrado — adicione documentos na base de conhecimento"
    );
  } catch (error) {
    return item(
      "embeddings",
      "Embeddings",
      "error",
      error?.message || "Falha ao verificar embeddings"
    );
  }
};

const checkActiveAgent = async (companyId: number): Promise<DiagnosticItem> => {
  try {
    const count = await AiAgent.count({ where: { companyId, active: true } });
    if (count > 0) {
      return item(
        "active_agent",
        "Agente ativo",
        "ok",
        `${count} agente(s) ativo(s)`,
        { count }
      );
    }
    return item(
      "active_agent",
      "Agente ativo",
      "error",
      "Nenhum agente ativo — crie um em IA → Agentes"
    );
  } catch (error) {
    return item(
      "active_agent",
      "Agente ativo",
      "error",
      error?.message || "Falha ao verificar agentes"
    );
  }
};

const checkReadyBases = async (companyId: number): Promise<DiagnosticItem> => {
  try {
    const bases = await KnowledgeBase.count({
      where: { companyId, active: true }
    });
    const readyDocs = await KnowledgeDocument.count({
      where: { companyId, status: "ready" }
    });

    if (bases > 0 && readyDocs > 0) {
      return item(
        "knowledge_ready",
        "Bases prontas",
        "ok",
        `${bases} base(s) e ${readyDocs} documento(s) prontos`,
        { bases, readyDocs }
      );
    }

    if (!bases) {
      return item(
        "knowledge_ready",
        "Bases prontas",
        "error",
        "Nenhuma base de conhecimento ativa"
      );
    }

    return item(
      "knowledge_ready",
      "Bases prontas",
      "warning",
      "Base existe, mas nenhum documento está com status ready"
    );
  } catch (error) {
    return item(
      "knowledge_ready",
      "Bases prontas",
      "error",
      error?.message || "Falha ao verificar bases de conhecimento"
    );
  }
};

const checkWhatsapp = async (companyId: number): Promise<DiagnosticItem> => {
  const connections = await Whatsapp.findAll({ where: { companyId } });
  const connected = connections.filter(conn =>
    ["CONNECTED", "open", "connected"].includes(
      String(conn.status || "").toUpperCase()
    )
  );

  if (connected.length) {
    return item(
      "whatsapp",
      "WhatsApp conectado",
      "ok",
      `${connected.length} conexão(ões) ativa(s)`,
      { names: connected.map(c => c.name) }
    );
  }

  if (!connections.length) {
    return item(
      "whatsapp",
      "WhatsApp conectado",
      "warning",
      "Nenhuma conexão WhatsApp cadastrada"
    );
  }

  return item(
    "whatsapp",
    "WhatsApp conectado",
    "warning",
    "WhatsApp cadastrado, mas não conectado",
    { statuses: connections.map(c => ({ name: c.name, status: c.status })) }
  );
};

const checkAiQueue = async (): Promise<DiagnosticItem> => {
  try {
    const metrics = await getAiQueueMetrics();
    const pending = metrics.waiting + metrics.delayed;
    const status: DiagnosticStatus = metrics.congested
      ? "warning"
      : metrics.failed > 0 && metrics.active > 0
        ? "warning"
        : "ok";

    const message = metrics.congested
      ? `Fila congestionada: ${pending} pendente(s), ${metrics.active} em execução`
      : `${pending} pendente(s), ${metrics.active} em execução, ${metrics.completed} concluído(s), ${metrics.failed} com erro`;

    return item("ai_queue", "Fila de IA", status, message, metrics);
  } catch (error) {
    return item(
      "ai_queue",
      "Fila de IA",
      "warning",
      error?.message || "Não foi possível consultar a fila de IA"
    );
  }
};

const checkLastProcessing = async (
  companyId: number
): Promise<DiagnosticItem> => {
  try {
    const lastLog = await AiConversationLog.findOne({
      where: { companyId },
      order: [["createdAt", "DESC"]]
    });

    if (!lastLog) {
      return item(
        "last_processing",
        "Último processamento",
        "warning",
        "Nenhuma conversa processada pela IA ainda"
      );
    }

    return item(
      "last_processing",
      "Último processamento",
      "ok",
      `Última interação em ${lastLog.createdAt.toISOString()}`,
      {
        ticketId: lastLog.ticketId,
        model: lastLog.model,
        transferredToHuman: lastLog.transferredToHuman
      }
    );
  } catch (error) {
    return item(
      "last_processing",
      "Último processamento",
      "error",
      error?.message || "Falha ao verificar último processamento"
    );
  }
};

const buildResult = (
  scope: "global" | "company",
  items: DiagnosticItem[],
  aiFeaturesEnabled: boolean,
  companyId?: number
): AiDiagnosticsResult => {
  const pendingMigrations =
    items.find(i => i.key === "migrations")?.details?.pending || [];

  const warnings = collectMessages(items, "warning");
  const errors = collectMessages(items, "error");

  return {
    scope,
    companyId,
    overall: mergeOverall(items),
    checkedAt: new Date().toISOString(),
    items,
    pendingMigrations: Array.isArray(pendingMigrations)
      ? (pendingMigrations as string[])
      : [],
    warnings,
    errors,
    aiFeaturesEnabled
  };
};

export const runGlobalDiagnostics = async (): Promise<AiDiagnosticsResult> => {
  const items = await Promise.all([
    checkDatabaseConnectivity(),
    checkMigrations(),
    checkPgVector(),
    checkAiTables(),
    checkVectorIndex()
  ]);

  const migrationsOk = items.find(i => i.key === "migrations")?.status === "ok";
  const tablesOk = items.find(i => i.key === "ai_tables")?.status === "ok";
  const dbOk = items.find(i => i.key === "database")?.status === "ok";
  const aiFeaturesEnabled = Boolean(dbOk && tablesOk && migrationsOk);

  return buildResult("global", items, aiFeaturesEnabled);
};

export const runCompanyDiagnostics = async (
  companyId: number,
  { live = false }: { live?: boolean } = {}
): Promise<AiDiagnosticsResult> => {
  const globalItems = await Promise.all([
    checkDatabaseConnectivity(),
    checkMigrations(),
    checkPgVector(),
    checkAiTables(),
    checkVectorIndex()
  ]);

  const migrationsOk =
    globalItems.find(i => i.key === "migrations")?.status === "ok";
  const tablesOk =
    globalItems.find(i => i.key === "ai_tables")?.status === "ok";
  const dbOk = globalItems.find(i => i.key === "database")?.status === "ok";
  const aiFeaturesEnabled = Boolean(dbOk && tablesOk && migrationsOk);

  const companyChecks = [
    checkProviderConfig(companyId),
    checkProviderConnectivity(companyId, live),
    checkStorage(companyId),
    checkWhatsapp(companyId),
    checkAiQueue()
  ];

  if (tablesOk) {
    companyChecks.push(
      checkEmbeddings(companyId),
      checkActiveAgent(companyId),
      checkReadyBases(companyId),
      checkLastProcessing(companyId)
    );
  }

  const companyItems = await Promise.all(companyChecks);
  const items = [...globalItems, ...companyItems];

  return buildResult("company", items, aiFeaturesEnabled, companyId);
};

export const logDiagnosticsSummary = (result: AiDiagnosticsResult): void => {
  const logFn =
    result.overall === "error"
      ? logger.error.bind(logger)
      : result.overall === "warning"
        ? logger.warn.bind(logger)
        : logger.info.bind(logger);

  logFn(
    {
      overall: result.overall,
      errors: result.errors,
      warnings: result.warnings,
      pendingMigrations: result.pendingMigrations
    },
    "AI platform diagnostics completed"
  );
};
