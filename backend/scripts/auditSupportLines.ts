/**
 * Audit Fortmax / Nível support line wiring (WhatsApp → fila → agente → domínio → bases).
 *
 * Usage:
 *   COMPANY_ID=1 npm run audit:support-lines
 */
import "../src/bootstrap";
import Company from "../src/models/Company";
import { auditSupportLinesForCompany } from "../src/services/AiServices/AuditSupportLinesService";
import { logger } from "../src/utils/logger";

const COMPANY_ID = Number(process.env.COMPANY_ID || 1);

const run = async (): Promise<void> => {
  const company = await Company.findByPk(COMPANY_ID);
  if (!company) {
    throw new Error(`Company ${COMPANY_ID} not found`);
  }

  const audit = await auditSupportLinesForCompany(COMPANY_ID);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(audit, null, 2));

  if (!audit.ok) {
    process.exitCode = 1;
  }
};

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch(error => {
    logger.error({ error }, "Failed to audit support lines");
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
