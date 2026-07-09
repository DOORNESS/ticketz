import { Request, Response } from "express";
import { getAiDashboard } from "../services/AiServices/AiDashboardService";
import { safeAiQuery } from "../helpers/safeAiQuery";

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
  const dashboard = await safeAiQuery(
    () => getAiDashboard(companyId),
    emptyDashboard
  );
  return res.json(dashboard);
};
