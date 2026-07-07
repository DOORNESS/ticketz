import {
  initializeMigrations,
  isAiSchemaReady
} from "../MigrationServices/MigrationService";
import {
  setPlatformBootstrap,
  updateAiFeaturesEnabled,
  updateMigrationsPending
} from "./AiPlatformState";
import { logger } from "../../utils/logger";

export const bootstrapAiPlatform = async (): Promise<void> => {
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
  } catch (error) {
    logger.error({ error }, "AI platform bootstrap failed");
    updateAiFeaturesEnabled(false);
  }
};
