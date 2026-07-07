import { AiDiagnosticsResult } from "./AiDiagnosticsService";

type PlatformSnapshot = {
  migrationsPending: string[];
  autoMigrateEnabled: boolean;
  aiFeaturesEnabled: boolean;
  lastGlobalDiagnostics: AiDiagnosticsResult | null;
  lastCompanyDiagnostics: Record<number, AiDiagnosticsResult>;
  bootstrappedAt: string | null;
};

const state: PlatformSnapshot = {
  migrationsPending: [],
  autoMigrateEnabled: false,
  aiFeaturesEnabled: false,
  lastGlobalDiagnostics: null,
  lastCompanyDiagnostics: {},
  bootstrappedAt: null
};

export const setPlatformBootstrap = (input: {
  migrationsPending: string[];
  autoMigrateEnabled: boolean;
  aiFeaturesEnabled: boolean;
  globalDiagnostics: AiDiagnosticsResult | null;
}): void => {
  state.migrationsPending = input.migrationsPending;
  state.autoMigrateEnabled = input.autoMigrateEnabled;
  state.aiFeaturesEnabled = input.aiFeaturesEnabled;
  state.lastGlobalDiagnostics = input.globalDiagnostics;
  state.bootstrappedAt = new Date().toISOString();
};

export const setCompanyDiagnostics = (
  companyId: number,
  diagnostics: AiDiagnosticsResult
): void => {
  state.lastCompanyDiagnostics[companyId] = diagnostics;
};

export const getCompanyDiagnostics = (
  companyId: number
): AiDiagnosticsResult | null =>
  state.lastCompanyDiagnostics[companyId] || null;

export const isAiFeaturesEnabled = (): boolean => state.aiFeaturesEnabled;

export const getMigrationsPending = (): string[] => state.migrationsPending;

export const getLastGlobalDiagnostics = (): AiDiagnosticsResult | null =>
  state.lastGlobalDiagnostics;

export const updateAiFeaturesEnabled = (enabled: boolean): void => {
  state.aiFeaturesEnabled = enabled;
};

export const updateMigrationsPending = (pending: string[]): void => {
  state.migrationsPending = pending;
  if (pending.length > 0) {
    state.aiFeaturesEnabled = false;
  }
};
