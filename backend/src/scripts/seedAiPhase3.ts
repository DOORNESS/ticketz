/**
 * Idempotent seed for AI Phase 3 memory + tools bindings.
 *
 * Usage:
 *   COMPANY_ID=<companyId> npm run seed:ai-phase3
 */
import "../bootstrap";
import sequelize from "../database";
import AiAgent from "../models/AiAgent";
import { seedDefaultAgentTools } from "../services/AiServices/tools/AiAgentToolService";
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
        console.log(`Tools seeded for agent ${agent.id} (${agent.name})`);
      })
  );

  console.log("Seed completed (idempotent). Enable per company:");
  console.log("  AI_CONTACT_MEMORY_ENABLED=true");
  console.log("  AI_TOOLS_ENABLED=true");
  console.log("  Setting aiContactMemoryEnabled=enabled");
  console.log("  Setting aiToolsEnabled=enabled for company", companyId);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
