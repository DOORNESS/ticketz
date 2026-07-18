import "../bootstrap";
import { Op } from "sequelize";
import sequelize from "../database";
import ContactAiMemory from "../models/ContactAiMemory";
import ContactAiMemoryLog from "../models/ContactAiMemoryLog";

/**
 * Audits and fixes agent-created memories incorrectly marked human_verified.
 *
 * Usage:
 *   COMPANY_ID=<id> npm run fix:agent-memory -- [--apply]
 */

const companyId = Number(process.env.COMPANY_ID);
const apply = process.argv.includes("--apply");

if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error("COMPANY_ID required");
  process.exit(1);
}

(async () => {
  await sequelize.authenticate();

  const invalid = await ContactAiMemory.findAll({
    where: {
      companyId,
      deletedAt: null,
      [Op.or]: [
        { source: "agent", verificationStatus: "human_verified" },
        { memoryType: "agent_note", verificationStatus: "human_verified" },
        { source: "agent", memoryType: "human_note" }
      ]
    }
  });

  console.log("Invalid agent memory records:", invalid.length);

  for (const row of invalid) {
    console.log({
      id: row.id,
      memoryType: row.memoryType,
      verificationStatus: row.verificationStatus,
      source: row.source,
      key: row.key
    });

    if (apply) {
      const before = row.get({ plain: true });
      await row.update({
        memoryType: "agent_note",
        verificationStatus: "unverified",
        source: "agent"
      });
      await ContactAiMemoryLog.create({
        companyId,
        contactId: row.contactId,
        memoryId: row.id,
        action: "correct",
        actorType: "system",
        actorId: null,
        before,
        after: row.get({ plain: true }),
        reason: "phase34_consolidation_semantics_fix"
      });
    }
  }

  console.log(apply ? "Applied corrections" : "Dry-run only (use --apply)");
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
