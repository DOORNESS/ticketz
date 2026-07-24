/**
 * Wire Fortmax (Web G3) and Nível Cashback WhatsApp lines to the correct
 * queues, agents and knowledge bases.
 *
 * Usage:
 *   COMPANY_ID=1 npm run wire:support-lines
 */
import "../src/bootstrap";
import Company from "../src/models/Company";
import { wireSupportLinesForCompany } from "../src/services/AiServices/WireSupportLinesService";
import { logger } from "../src/utils/logger";

const COMPANY_ID = Number(process.env.COMPANY_ID || 1);

const run = async (): Promise<void> => {
  const company = await Company.findByPk(COMPANY_ID);
  if (!company) {
    throw new Error(`Company ${COMPANY_ID} not found`);
  }

  const summary = await wireSupportLinesForCompany(COMPANY_ID);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error({ error }, "Failed to wire support lines");
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
