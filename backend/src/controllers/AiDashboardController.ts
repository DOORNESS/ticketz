import { Request, Response } from "express";
import { getAiDashboard } from "../services/AiServices/AiDashboardService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const dashboard = await getAiDashboard(companyId);
  return res.json(dashboard);
};
