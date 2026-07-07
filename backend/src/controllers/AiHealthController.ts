import { Request, Response } from "express";
import {
  getLastGlobalDiagnostics,
  getMigrationsPending,
  isAiFeaturesEnabled
} from "../services/AiServices/AiPlatformState";
import { runCompanyDiagnostics } from "../services/AiServices/AiDiagnosticsService";
import AiAgent from "../models/AiAgent";
import KnowledgeDocument from "../models/KnowledgeDocument";
import { safeAiQuery } from "../helpers/safeAiQuery";

const summarizeHealth = async (companyId: number) => {
  const diagnostics = await runCompanyDiagnostics(companyId, { live: false });
  const global = getLastGlobalDiagnostics();

  const itemMap = Object.fromEntries(
    diagnostics.items.map(item => [item.key, item])
  );

  const activeAgents = await safeAiQuery(
    () => AiAgent.count({ where: { companyId, active: true } }),
    0
  );
  const readyDocuments = await safeAiQuery(
    () => KnowledgeDocument.count({ where: { companyId, status: "ready" } }),
    0
  );

  return {
    status: diagnostics.overall,
    aiFeaturesEnabled: isAiFeaturesEnabled(),
    checkedAt: diagnostics.checkedAt,
    provider: itemMap.provider_config?.details?.provider || null,
    model: null,
    database: itemMap.database?.status || "unknown",
    pgvector: itemMap.pgvector?.status || "unknown",
    storage: itemMap.storage?.status || "unknown",
    embeddings: itemMap.embeddings?.status || "unknown",
    agents: activeAgents,
    documents: readyDocuments,
    migrations: {
      pending: getMigrationsPending(),
      status: itemMap.migrations?.status || "unknown"
    },
    globalBootstrappedAt: global?.checkedAt || null,
    warnings: diagnostics.warnings,
    errors: diagnostics.errors
  };
};

export const health = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const payload = await summarizeHealth(companyId);
  const statusCode = payload.status === "error" ? 503 : 200;
  return res.status(statusCode).json(payload);
};
