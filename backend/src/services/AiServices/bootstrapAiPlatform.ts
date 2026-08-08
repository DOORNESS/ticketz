import {
  initializeMigrations,
  isAiSchemaReady
} from "../MigrationServices/MigrationService";
import {
  setPlatformBootstrap,
  updateAiFeaturesEnabled,
  updateMigrationsPending
} from "./AiPlatformState";
import { ensureAiFirstResponderForAllCompanies } from "./EnsureAiFirstResponderService";
import { ensurePilotToolsRegistered } from "./tools/registerPilotTools";
import { logger } from "../../utils/logger";

/** Mesmas empresas que o religamento legado já usava. */
const resolveWireCompanyIds = (): number[] => {
  const raw = process.env.WIRE_SUPPORT_LINES_COMPANY_IDS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map(id => Number(id.trim()))
      .filter(id => Number.isFinite(id) && id > 0);
  }
  return [Number(process.env.WIRE_SUPPORT_LINES_COMPANY_ID || 1)];
};

export const bootstrapAiPlatform = async (): Promise<void> => {
  ensurePilotToolsRegistered();

  try {
    const migrationState = await initializeMigrations();
    const aiReady = await isAiSchemaReady();

    setPlatformBootstrap({
      migrationsPending: migrationState.pending.filter(
        name => name.startsWith("20260707") || name.startsWith("20260708")
      ),
      autoMigrateEnabled: migrationState.autoMigrateEnabled,
      aiFeaturesEnabled: aiReady,
      globalDiagnostics: null
    });

    updateMigrationsPending(
      migrationState.pending.filter(
        name => name.startsWith("20260707") || name.startsWith("20260708")
      )
    );
    updateAiFeaturesEnabled(aiReady);

    if (migrationState.applied.length) {
      logger.info(
        { applied: migrationState.applied },
        "Database migrations applied on startup"
      );
    }

    if (aiReady) {
      if (process.env.WIRE_SUPPORT_LINES !== "0") {
        try {
          /**
           * Religamento por marca quando a estrutura já está vinculada; o
           * caminho legado (casamento por nome) só entra enquanto alguma
           * marca ainda estiver incompleta.
           *
           * É o que permite a Brand 3 funcionar sem `wireBrand3Line`: se ela
           * tem conexão e agente vinculados, o laço genérico dá conta.
           */
          const companyIds = resolveWireCompanyIds();
          const { hasCompleteBrandWiring, wireBrandLinesForCompany } =
            await import("../BrandServices/WireBrandLinesService");

          let legacyNeeded = false;

          // eslint-disable-next-line no-restricted-syntax
          for (const companyId of companyIds) {
            if (await hasCompleteBrandWiring(companyId)) {
              await wireBrandLinesForCompany(companyId);
            } else {
              legacyNeeded = true;
            }
          }

          if (legacyNeeded) {
            logger.warn(
              { legacyBrandWiringFallback: true },
              "Marca incompleta — usando religamento legado por nome"
            );
            const { wireSupportLinesForConfiguredCompanies } =
              await import("./WireSupportLinesService");
            await wireSupportLinesForConfiguredCompanies();
          }
        } catch (error) {
          logger.error({ error }, "Failed to wire support lines on startup");
        }
      }

      try {
        await ensureAiFirstResponderForAllCompanies();
      } catch (error) {
        logger.error(
          { error },
          "Failed to ensure AI first responder configuration"
        );
      }

      const { reengageStuckAiTicketsForConfiguredCompanies } =
        await import("./ReengageStuckAiTicketsService");
      reengageStuckAiTicketsForConfiguredCompanies().catch(error => {
        logger.error(
          { error },
          "Failed to re-engage stuck AI tickets on startup"
        );
      });
    }
  } catch (error) {
    logger.error({ error }, "AI platform bootstrap failed");
    updateAiFeaturesEnabled(false);
  }
};
