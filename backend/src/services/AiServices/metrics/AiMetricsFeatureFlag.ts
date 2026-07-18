export const isMetricsV2Enabled = (): boolean =>
  ["true", "1", "yes", "enabled"].includes(
    String(process.env.AI_METRICS_V2_ENABLED || "false")
      .trim()
      .toLowerCase()
  );
