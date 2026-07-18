/**
 * Audit script for AI Phase 4.
 *
 * Usage:
 *   COMPANY_ID=<companyId> npm run audit:ai-phase4
 */
import "../bootstrap";
import sequelize from "../database";
import AiMetricsSnapshot from "../models/AiMetricsSnapshot";
import AiToolExecutionLog from "../models/AiToolExecutionLog";
import MessageMediaFile from "../models/MessageMediaFile";
import {
  listTools,
  isWriteRiskLevel
} from "../services/AiServices/tools/ToolRegistry";
import { getWriteToolsStatus } from "../services/AiServices/tools/AiWriteToolsFeatureFlag";
import { isMetricsV2Enabled } from "../services/AiServices/metrics/AiMetricsFeatureFlag";
import { ensurePilotToolsRegistered } from "../services/AiServices/tools/registerPilotTools";

const companyId = Number(process.env.COMPANY_ID);
if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error("COMPANY_ID env var is required");
  process.exit(1);
}

(async () => {
  await sequelize.authenticate();

  ensurePilotToolsRegistered();

  const tools = listTools();
  const writeTools = tools.filter(tool => isWriteRiskLevel(tool.riskLevel));
  const writeStatus = await getWriteToolsStatus(companyId);

  const [snapshots, toolLogs, mediaFiles] = await Promise.all([
    AiMetricsSnapshot.count({ where: { companyId } }),
    AiToolExecutionLog.count({ where: { companyId, riskLevel: "write" } }),
    MessageMediaFile.count({ where: { companyId } })
  ]);

  console.log("=== AI Phase 4 Audit ===");
  console.log("Company:", companyId);
  console.log("Registered tools:", tools.length);
  console.log("Write tools:", writeTools.map(tool => tool.id).join(", "));
  console.log("Write tools active:", writeStatus.active);
  console.log("Metrics v2 enabled:", isMetricsV2Enabled());
  console.log("Metrics snapshots:", snapshots);
  console.log("Write tool executions:", toolLogs);
  console.log("MessageMediaFiles:", mediaFiles);
  console.log("Status: OK");
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
