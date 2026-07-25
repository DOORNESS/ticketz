"use strict";
/**
 * Audit Fortmax / Nível support line wiring on VPS.
 *   node scripts/audit-support-lines.js
 */
require("../dist/bootstrap");
require("../dist/database");

const {
  auditSupportLinesForCompany
} = require("../dist/services/AiServices/AuditSupportLinesService");

const COMPANY_ID = Number(process.env.COMPANY_ID || 1);

auditSupportLinesForCompany(COMPANY_ID)
  .then(audit => {
    console.log(JSON.stringify(audit, null, 2));
    process.exit(audit.ok ? 0 : 1);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
