const TOKEN_COST_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  default: { input: 0.15, output: 0.6 }
};

export const estimateAiCostUsd = (
  model: string | null | undefined,
  tokensInput: number,
  tokensOutput: number
): number => {
  const pricing =
    TOKEN_COST_PER_MILLION[model || ""] || TOKEN_COST_PER_MILLION.default;

  return (
    (tokensInput / 1_000_000) * pricing.input +
    (tokensOutput / 1_000_000) * pricing.output
  );
};

export const computeConfidenceScore = ({
  topSimilarity,
  hasReliableContext,
  responseLength
}: {
  topSimilarity: number;
  hasReliableContext: boolean;
  responseLength: number;
}): number => {
  let score = topSimilarity;

  if (hasReliableContext) {
    score += 0.15;
  }

  if (responseLength > 40) {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
};

export const formatConfidencePercent = (confidence?: number | null): string => {
  if (confidence === null || confidence === undefined) {
    return "—";
  }

  return `${Math.round(confidence * 100)}%`;
};
