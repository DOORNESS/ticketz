const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFloatEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type AiOrchestratorConfig = {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  confidenceThreshold: number;
  provider: string;
};

export const isGlobalOrchestratorEnabled = (): boolean =>
  ["true", "1", "yes", "enabled"].includes(
    String(process.env.AI_ORCHESTRATOR_ENABLED || "")
      .trim()
      .toLowerCase()
  );

export const getOrchestratorConfig = (): AiOrchestratorConfig => ({
  enabled: isGlobalOrchestratorEnabled(),
  model: String(process.env.AI_ORCHESTRATOR_MODEL || "").trim(),
  temperature: parseFloatEnv(process.env.AI_ORCHESTRATOR_TEMPERATURE, 0),
  maxTokens: parsePositiveInt(process.env.AI_ORCHESTRATOR_MAX_TOKENS, 200),
  timeoutMs: parsePositiveInt(process.env.AI_ORCHESTRATOR_TIMEOUT_MS, 15000),
  confidenceThreshold: parseFloatEnv(
    process.env.AI_ORCHESTRATOR_CONFIDENCE_THRESHOLD,
    0.4
  ),
  provider: String(process.env.AI_ORCHESTRATOR_PROVIDER || "").trim()
});

export const assertOrchestratorConfigReady = (): AiOrchestratorConfig => {
  const config = getOrchestratorConfig();

  if (!config.model) {
    throw new Error("AI_ORCHESTRATOR_MODEL is not configured");
  }

  if (!config.provider) {
    throw new Error("AI_ORCHESTRATOR_PROVIDER is not configured");
  }

  return config;
};
