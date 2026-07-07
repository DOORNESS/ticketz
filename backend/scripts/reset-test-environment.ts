import "../src/bootstrap";
import Company from "../src/models/Company";
import { resetTestEnvironmentForCompany } from "../src/services/AiServices/ResetTestEnvironmentService";
import { logger } from "../src/utils/logger";

const run = async (): Promise<void> => {
  const companyIdArg = process.argv[2];
  const companies = companyIdArg
    ? [{ id: Number(companyIdArg) }]
    : await Company.findAll({ attributes: ["id"] });

  await Promise.all(
    companies.map(async company => {
      const summary = await resetTestEnvironmentForCompany(company.id);
      logger.info({ summary }, "Company environment reset");
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(summary, null, 2));
    })
  );

  process.exit(0);
};

run().catch(error => {
  logger.error({ error }, "Failed to reset test environment");
  process.exit(1);
});
