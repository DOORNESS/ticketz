import { Request, Response } from "express";

import {
  DashboardDateRange,
  statusSummaryService,
  ticketsStatisticsService,
  usersReportService
} from "../services/ReportService/DashboardService";
import { logger } from "../utils/logger";

const emptyTicketCounters = {
  field: "timestamp",
  start: new Date(),
  end: new Date(),
  counters: []
};

const emptyTicketsStatistics = {
  ticketCounters: {
    create: emptyTicketCounters,
    accept: emptyTicketCounters,
    transfer: emptyTicketCounters,
    close: emptyTicketCounters
  },
  ticketStatistics: {
    avgWaitTime: null,
    avgServiceTime: null,
    totalClosed: 0,
    newContacts: 0
  }
};

export const ticketsStatistic = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const params: DashboardDateRange = req.query;
  const { companyId } = req.user;
  const startedAt = Date.now();

  try {
    const result = await ticketsStatisticsService(companyId, params);
    logger.info(
      { companyId, route: "dashboard/tickets", ms: Date.now() - startedAt },
      "Dashboard tickets statistics"
    );
    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      {
        error,
        companyId,
        route: "dashboard/tickets",
        ms: Date.now() - startedAt
      },
      "Dashboard tickets statistics failed"
    );
    return res.status(200).json(emptyTicketsStatistics);
  }
};

export const usersReport = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const params: DashboardDateRange = req.query;
  const { companyId } = req.user;
  const startedAt = Date.now();

  try {
    const result = await usersReportService(companyId, params);
    logger.info(
      { companyId, route: "dashboard/users", ms: Date.now() - startedAt },
      "Dashboard users report"
    );
    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      {
        error,
        companyId,
        route: "dashboard/users",
        ms: Date.now() - startedAt
      },
      "Dashboard users report failed"
    );
    return res.status(200).json({
      start: params.date_from || "",
      end: params.date_to || "",
      userReport: []
    });
  }
};

export const statusSummary = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const startedAt = Date.now();

  try {
    const dashboardData = await statusSummaryService(companyId);
    logger.info(
      { companyId, route: "dashboard/status", ms: Date.now() - startedAt },
      "Dashboard status summary"
    );
    return res.status(200).json(dashboardData);
  } catch (error) {
    logger.error(
      {
        error,
        companyId,
        route: "dashboard/status",
        ms: Date.now() - startedAt
      },
      "Dashboard status summary failed"
    );
    return res.status(200).json({
      ticketsStatusSummary: [],
      usersStatusSummary: []
    });
  }
};
