import { initializeMigrations } from "../MigrationServices/MigrationService";
import {
  setPlatformBootstrap,
  updateAiFeaturesEnabled,
  updateMigrationsPending
} from "./AiPlatformState";
import { logger } from "../../utils/logger";

export const bootstrapAiPlatform = async (): Promise<void> => {
  try {
    const migrationState = await initializeMigrations();

    setPlatformBootstrap({
      migrationsPending: migrationState.pending,
      autoMigrateEnabled: migrationState.autoMigrateEnabled,
      aiFeaturesEnabled: migrationState.pending.length === 0,
      globalDiagnostics: null
    });

    updateMigrationsPending(migrationState.pending);
    updateAiFeaturesEnabled(migrationState.pending.length === 0);

    if (migrationState.applied.length) {
      logger.info(
        { applied: migrationState.applied },
        "Database migrations applied on startup"
      );
    }
  } catch (error) {
    logger.error({ error }, "AI platform bootstrap failed");
    updateAiFeaturesEnabled(false);
  }
};
