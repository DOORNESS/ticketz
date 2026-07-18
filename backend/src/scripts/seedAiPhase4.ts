/**
 * Idempotent seed for AI Phase 4 write tools + metrics snapshot.
 *
 * Usage:
 *   COMPANY_ID=<companyId> npm run seed:ai-phase4
 */
import "../bootstrap";
import sequelize from "../database";
import AiAgent from "../models/AiAgent";
import { seedDefaultAgentTools } from "../services/AiServices/tools/AiAgentToolService";
import { enqueueCompanyMetricsSnapshot } from "../services/AiServices/metrics/AiMetricsQueueService";
import { ensurePilotToolsRegistered } from "../services/AiServices/tools/registerPilotTools";

const companyId = Number(process.env.COMPANY_ID);
if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error("COMPANY_ID env var is required (positive integer)");
  process.exit(1);
}

(async () => {
  await sequelize.authenticate();
  ensurePilotToolsRegistered();

  const agents = await AiAgent.findAll({
    where: { companyId, active: true },
    order: [["id", "ASC"]]
  });

  if (!agents.length) {
    console.error("No active agents found for company", companyId);
    process.exit(1);
  }

  await Promise.all(
    agents
      .filter(agent => agent.role !== "orchestrator")
      .map(async agent => {
        await seedDefaultAgentTools(companyId, agent.id);
        console.log(`Tools (incl. write) seeded for agent ${agent.id}`);
      })
  );

  await enqueueCompanyMetricsSnapshot(companyId);
  console.log("Metrics snapshot job enqueued");

  console.log("Seed completed. Enable per company:");
  console.log("  AI_WRITE_TOOLS_ENABLED=true");
  console.log("  AI_METRICS_V2_ENABLED=true");
  console.log("  Setting aiWriteToolsEnabled=enabled");
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
