import { Op } from "sequelize";
import AiMetricsSnapshot from "../../../models/AiMetricsSnapshot";
import { aggregateDailySnapshot } from "./AiMetricsAggregatorService";
import { invalidateDashboardCache } from "./AiDashboardCacheService";

export const upsertDailySnapshot = async (
  companyId: number,
  periodStart: Date
): Promise<AiMetricsSnapshot> => {
  const start = new Date(periodStart);
  start.setHours(0, 0, 0, 0);

  const metricsJson = await aggregateDailySnapshot(companyId, start);

  const existing = await AiMetricsSnapshot.findOne({
    where: {
      companyId,
      periodType: "daily",
      periodStart: start
    }
  });

  if (existing) {
    await existing.update({ metricsJson });
    await invalidateDashboardCache(companyId);
    return existing.reload();
  }

  const created = await AiMetricsSnapshot.create({
    companyId,
    periodType: "daily",
    periodStart: start,
    metricsJson
  });

  await invalidateDashboardCache(companyId);
  return created;
};

export const listMetricSnapshots = async (input: {
  companyId: number;
  periodType?: string;
  days?: number;
}): Promise<AiMetricsSnapshot[]> => {
  const since = new Date();
  since.setDate(since.getDate() - (input.days || 30));

  return AiMetricsSnapshot.findAll({
    where: {
      companyId: input.companyId,
      periodType: input.periodType || "daily",
      periodStart: { [Op.gte]: since }
    },
    order: [["periodStart", "ASC"]]
  });
};

export const getTimeseries = async (
  companyId: number,
  days = 30
): Promise<
  Array<{
    date: string;
    costUsd: number;
    conversations: number;
    toolExecutions: number;
  }>
> => {
  const snapshots = await listMetricSnapshots({ companyId, days });

  return snapshots.map(snapshot => {
    const metrics = snapshot.metricsJson as {
      conversations?: number;
      tokens?: { costUsd?: number };
      tools?: { executions?: number };
    };

    return {
      date: snapshot.periodStart.toISOString().slice(0, 10),
      costUsd: Number(metrics.tokens?.costUsd) || 0,
      conversations: Number(metrics.conversations) || 0,
      toolExecutions: Number(metrics.tools?.executions) || 0
    };
  });
};
