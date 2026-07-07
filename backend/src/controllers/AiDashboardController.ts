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
  recentErrors: []
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const dashboard = await safeAiQuery(
    () => getAiDashboard(companyId),
    emptyDashboard
  );
  return res.json(dashboard);
};
