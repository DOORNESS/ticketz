import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { getPendingMigrations } from "../services/MigrationServices/MigrationService";
import {
  updateAiFeaturesEnabled,
  updateMigrationsPending
} from "../services/AiServices/AiPlatformState";

export const requireAiPlatformReady = async (
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const pending = await getPendingMigrations();
    updateMigrationsPending(pending);

    if (pending.length) {
      throw new AppError("ERR_AI_MIGRATIONS_PENDING", 503);
    }

    updateAiFeaturesEnabled(true);
    next();
  } catch (error) {
    next(error);
  }
};
