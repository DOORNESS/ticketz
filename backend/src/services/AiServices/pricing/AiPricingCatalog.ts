export type ModelPricing = {
  input: number;
  output: number;
};

const TOKEN_COST_PER_MILLION: Record<string, ModelPricing> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  default: { input: 0.15, output: 0.6 }
};

export const estimateCostUsd = (
  model: string | null | undefined,
  tokensInput: number,
  tokensOutput: number
): number => {
  const normalized = String(model || "").toLowerCase();
  const pricing =
    Object.entries(TOKEN_COST_PER_MILLION).find(([key]) =>
      normalized.includes(key)
    )?.[1] || TOKEN_COST_PER_MILLION.default;

  return (
    (tokensInput / 1_000_000) * pricing.input +
    (tokensOutput / 1_000_000) * pricing.output
  );
};

export const getModelPricing = (
  model: string | null | undefined
): ModelPricing => {
  const normalized = String(model || "").toLowerCase();
  return (
    Object.entries(TOKEN_COST_PER_MILLION).find(([key]) =>
      normalized.includes(key)
    )?.[1] || TOKEN_COST_PER_MILLION.default
  );
};
