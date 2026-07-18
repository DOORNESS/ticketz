import { Request, Response } from "express";
import { getAiDashboard } from "../services/AiServices/AiDashboardService";
import { safeAiQuery } from "../helpers/safeAiQuery";
import {
  getCachedDashboard,
  setCachedDashboard
} from "../services/AiServices/metrics/AiDashboardCacheService";
import { isMetricsV2Enabled } from "../services/AiServices/metrics/AiMetricsFeatureFlag";
import {
  getTimeseries,
  listMetricSnapshots
} from "../services/AiServices/metrics/AiMetricsSnapshotService";

const emptyDashboard = {
  totals: {
    totalAttendances: 0,
    resolvedByAi: 0,
    transferredToHuman: 0,
    unanswered: 0,
    resolutionRate: 0,
    tokensInput: 0,
    tokensOutput: 0,
    estimatedCostTotalUsd: 0,
    estimatedCostTodayUsd: 0,
    estimatedCostMonthUsd: 0,
    avgResponseTimeMs: null
  },
  topTopics: [],
  topDocuments: [],
  unansweredQuestions: [],
  recentErrors: [],
  operational: {
    startedByAi: 0,
    resolvedByAiTickets: 0,
    transferredTickets: 0,
    handoffPending: 0,
    humanHandling: 0,
    closedByHuman: 0,
    aiResolutionRate: 0,
    avgHandoffWaitSeconds: null,
    handoffsByQueue: [],
    handoffsByReason: [],
    avgAiHandlingSeconds: null,
    estimatedHoursSaved: 0,
    estimatedCostSavedUsd: 0,
    audioCount: 0,
    imageCount: 0,
    documentCount: 0,
    aiSatisfactionAvg: null,
    humanSatisfactionAvg: null
  }
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  if (isMetricsV2Enabled()) {
    const cached = await getCachedDashboard(companyId);
    if (cached) {
      return res.json(cached);
    }
  }

  const dashboard = await safeAiQuery(
    () => getAiDashboard(companyId),
    emptyDashboard
  );

  if (isMetricsV2Enabled()) {
    await setCachedDashboard(companyId, dashboard as Record<string, unknown>);
  }

  return res.json(dashboard);
};

export const timeseries = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const days = req.query.days ? Number(req.query.days) : 30;
  const series = await getTimeseries(companyId, days);
  return res.json({ days, series });
};

export const agentMetrics = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const snapshots = await listMetricSnapshots({ companyId, days: 30 });
  const latest = snapshots[snapshots.length - 1];
  const byAgent =
    (latest?.metricsJson as { byAgent?: unknown[] } | undefined)?.byAgent || [];

  return res.json({ byAgent });
};
