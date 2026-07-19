"use strict";
/**
 * Ativa aiTriageV2Enabled para uma empresa de teste.
 *   COMPANY_ID=1 node scripts/enable-triage-v2-company.js
 */
require("../dist/bootstrap");
const sequelize = require("../dist/database").default;

const companyId = Number(process.env.COMPANY_ID || 1);
const schema = process.env.DB_SCHEMA || "ticketz";

const settings = [
  ["aiTriageV2Enabled", "enabled"],
  ["aiTranscribeOnlyWhenAiActive", "enabled"],
  ["aiAllowManualTranscription", "enabled"],
  ["aiMarkReadWhenAiResponds", "enabled"]
];

const run = async () => {
  for (const [key, value] of settings) {
    const [existing] = await sequelize.query(
      `
      SELECT id FROM "${schema}"."Settings"
      WHERE "companyId" = :companyId AND key = :key
      LIMIT 1
      `,
      { replacements: { companyId, key } }
    );

    if (existing.length) {
      await sequelize.query(
        `
        UPDATE "${schema}"."Settings"
        SET value = :value, "updatedAt" = NOW()
        WHERE "companyId" = :companyId AND key = :key
        `,
        { replacements: { companyId, key, value } }
      );
    } else {
      await sequelize.query(
        `
        INSERT INTO "${schema}"."Settings" (key, value, "companyId", "createdAt", "updatedAt")
        VALUES (:key, :value, :companyId, NOW(), NOW())
        `,
        { replacements: { companyId, key, value } }
      );
    }
  }

  console.log(
    JSON.stringify({ ok: true, companyId, settings: Object.fromEntries(settings) })
  );
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
