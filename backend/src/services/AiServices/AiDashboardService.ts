import { Op, fn, col, literal, QueryTypes } from "sequelize";
import sequelize from "../../database";
import AiConversationLog from "../../models/AiConversationLog";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import { AI_HANDOFF_REASON_LABELS } from "./AiOperationalTypes";

const TOKEN_COST_PER_MILLION = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  default: { input: 0.15, output: 0.6 }
};

const estimateCostUsd = (
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

const startOfDay = (): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfMonth = (): Date => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

type DashboardSummaryRow = {
  total: string;
  resolved: string;
  transferred: string;
  unanswered: string;
  tokensInput: string;
  tokensOutput: string;
};

type TopicRow = {
  topic: string;
  count: string;
};

type DocumentUsageRow = {
  documentTitle: string;
  count: string;
};

type ErrorRow = {
  id: number;
  createdAt: Date;
  ticketId: number | null;
  error: string;
};

export type AiDashboardData = {
  totals: {
    totalAttendances: number;
    resolvedByAi: number;
    transferredToHuman: number;
    unanswered: number;
    resolutionRate: number;
    tokensInput: number;
    tokensOutput: number;
    estimatedCostTotalUsd: number;
    estimatedCostTodayUsd: number;
    estimatedCostMonthUsd: number;
    avgResponseTimeMs: number | null;
  };
  topTopics: Array<{ topic: string; count: number }>;
  topDocuments: Array<{ documentTitle: string; count: number }>;
  unansweredQuestions: Array<{
    id: number;
    createdAt: Date;
    ticketId: number | null;
    userMessage: string;
  }>;
  recentErrors: Array<{
    id: number;
    createdAt: Date;
    ticketId: number | null;
    error: string;
  }>;
  operational: {
    startedByAi: number;
    resolvedByAiTickets: number;
    transferredTickets: number;
    handoffPending: number;
    humanHandling: number;
    closedByHuman: number;
    aiResolutionRate: number;
    avgHandoffWaitSeconds: number | null;
    handoffsByQueue: Array<{ queueName: string; count: number }>;
    handoffsByReason: Array<{ reason: string; label: string; count: number }>;
  };
};

const buildCostFromLogs = (
  logs: Array<{
    model: string | null;
    tokensInput: number | null;
    tokensOutput: number | null;
  }>
): number =>
  logs.reduce(
    (sum, log) =>
      sum +
      estimateCostUsd(
        log.model,
        Number(log.tokensInput) || 0,
        Number(log.tokensOutput) || 0
      ),
    0
  );

export const getAiDashboard = async (
  companyId: number
): Promise<AiDashboardData> => {
  const dayStart = startOfDay();
  const monthStart = startOfMonth();

  const [summary] = (await AiConversationLog.findAll({
    attributes: [
      [fn("COUNT", col("id")), "total"],
      [
        fn(
          "SUM",
          literal(
            `CASE WHEN "transferredToHuman" = false AND ("error" IS NULL OR "error" = '') AND COALESCE("aiResponse", '') <> '' THEN 1 ELSE 0 END`
          )
        ),
        "resolved"
      ],
      [
        fn(
          "SUM",
          literal(`CASE WHEN "transferredToHuman" = true THEN 1 ELSE 0 END`)
        ),
        "transferred"
      ],
      [
        fn(
          "SUM",
          literal(
            `CASE WHEN COALESCE("aiResponse", '') = '' OR ("error" IS NOT NULL AND "error" <> '') THEN 1 ELSE 0 END`
          )
        ),
        "unanswered"
      ],
      [fn("COALESCE", fn("SUM", col("tokensInput")), 0), "tokensInput"],
      [fn("COALESCE", fn("SUM", col("tokensOutput")), 0), "tokensOutput"]
    ],
    where: { companyId },
    raw: true
  })) as unknown as DashboardSummaryRow[];

  const [todayLogs, monthLogs, allLogsForCost] = await Promise.all([
    AiConversationLog.findAll({
      attributes: ["model", "tokensInput", "tokensOutput"],
      where: { companyId, createdAt: { [Op.gte]: dayStart } },
      raw: true
    }),
    AiConversationLog.findAll({
      attributes: ["model", "tokensInput", "tokensOutput"],
      where: { companyId, createdAt: { [Op.gte]: monthStart } },
      raw: true
    }),
    AiConversationLog.findAll({
      attributes: ["model", "tokensInput", "tokensOutput"],
      where: { companyId },
      raw: true
    })
  ]);

  const topTopics = (await sequelize.query(
    `
    SELECT LEFT("userMessage", 80) AS topic, COUNT(*)::int AS count
    FROM "AiConversationLogs"
    WHERE "companyId" = :companyId
      AND COALESCE("userMessage", '') <> ''
    GROUP BY LEFT("userMessage", 80)
    ORDER BY count DESC
    LIMIT 5
    `,
    {
      replacements: { companyId },
      type: QueryTypes.SELECT
    }
  )) as TopicRow[];

  const topDocuments = (await sequelize.query(
    `
    SELECT COALESCE(chunk->>'documentTitle', 'Documento #' || COALESCE(chunk->>'id', '?')) AS "documentTitle",
           COUNT(*)::int AS count
    FROM "AiConversationLogs" log
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(log."usedChunks", '[]'::jsonb)) AS chunk
    WHERE log."companyId" = :companyId
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 5
    `,
    {
      replacements: { companyId },
      type: QueryTypes.SELECT
    }
  )) as DocumentUsageRow[];

  const unansweredQuestions = await AiConversationLog.findAll({
    attributes: ["id", "createdAt", "ticketId", "userMessage"],
    where: {
      companyId,
      [Op.or]: [
        { aiResponse: "" },
        { aiResponse: null },
        { error: { [Op.ne]: null } }
      ]
    },
    order: [["createdAt", "DESC"]],
    limit: 8,
    raw: true
  });

  const recentErrors = (await sequelize.query(
    `
    SELECT id, "createdAt", "ticketId", "error"
    FROM "AiConversationLogs"
    WHERE "companyId" = :companyId
      AND COALESCE("error", '') <> ''
    ORDER BY "createdAt" DESC
    LIMIT 8
    `,
    {
      replacements: { companyId },
      type: QueryTypes.SELECT
    }
  )) as ErrorRow[];

  const totalAttendances = Number(summary?.total) || 0;
  const resolvedByAi = Number(summary?.resolved) || 0;
  const transferredToHuman = Number(summary?.transferred) || 0;
  const unanswered = Number(summary?.unanswered) || 0;
  const tokensInput = Number(summary?.tokensInput) || 0;
  const tokensOutput = Number(summary?.tokensOutput) || 0;

  const [
    startedByAi,
    resolvedByAiTickets,
    transferredTickets,
    handoffPending,
    humanHandling,
    closedByHuman
  ] = await Promise.all([
    Ticket.count({
      where: { companyId, aiStartedAt: { [Op.ne]: null } }
    }),
    Ticket.count({
      where: { companyId, aiResolvedByAi: true, status: "closed" }
    }),
    Ticket.count({
      where: { companyId, aiHandoff: true }
    }),
    Ticket.count({
      where: {
        companyId,
        aiHandoff: true,
        status: "pending",
        userId: null
      }
    }),
    Ticket.count({
      where: { companyId, status: "open", userId: { [Op.ne]: null } }
    }),
    Ticket.count({
      where: {
        companyId,
        status: "closed",
        aiResolvedByAi: false,
        aiStartedAt: { [Op.ne]: null }
      }
    })
  ]);

  const handoffsByQueue = (await Ticket.findAll({
    attributes: [
      [col("queue.name"), "queueName"],
      [fn("COUNT", col("Ticket.id")), "count"]
    ],
    where: { companyId, aiHandoff: true },
    include: [{ model: Queue, as: "queue", attributes: [] }],
    group: ["queue.id", "queue.name"],
    raw: true
  })) as unknown as Array<{ queueName: string; count: string }>;

  const handoffsByReasonRaw = (await Ticket.findAll({
    attributes: ["aiHandoffReason", [fn("COUNT", col("id")), "count"]],
    where: {
      companyId,
      aiHandoff: true,
      aiHandoffReason: { [Op.ne]: null }
    },
    group: ["aiHandoffReason"],
    raw: true
  })) as unknown as Array<{ aiHandoffReason: string; count: string }>;

  const waitingTickets = await Ticket.findAll({
    attributes: ["aiWaitingSince"],
    where: {
      companyId,
      aiHandoff: true,
      status: "pending",
      userId: null,
      aiWaitingSince: { [Op.ne]: null }
    },
    raw: true
  });

  const avgHandoffWaitSeconds =
    waitingTickets.length > 0
      ? Math.round(
          waitingTickets.reduce((sum, ticket) => {
            const waitingMs =
              Date.now() - new Date(ticket.aiWaitingSince).getTime();
            return sum + waitingMs / 1000;
          }, 0) / waitingTickets.length
        )
      : null;

  const aiResolutionRate =
    startedByAi > 0
      ? Math.round((resolvedByAiTickets / startedByAi) * 1000) / 10
      : 0;

  return {
    totals: {
      totalAttendances,
      resolvedByAi,
      transferredToHuman,
      unanswered,
      resolutionRate:
        totalAttendances > 0
          ? Math.round((resolvedByAi / totalAttendances) * 1000) / 10
          : 0,
      tokensInput,
      tokensOutput,
      estimatedCostTotalUsd: buildCostFromLogs(allLogsForCost),
      estimatedCostTodayUsd: buildCostFromLogs(todayLogs),
      estimatedCostMonthUsd: buildCostFromLogs(monthLogs),
      avgResponseTimeMs: null
    },
    topTopics: topTopics.map(row => ({
      topic: row.topic,
      count: Number(row.count) || 0
    })),
    topDocuments: topDocuments.map(row => ({
      documentTitle: row.documentTitle,
      count: Number(row.count) || 0
    })),
    unansweredQuestions: unansweredQuestions.map(row => ({
      id: row.id,
      createdAt: row.createdAt,
      ticketId: row.ticketId,
      userMessage: row.userMessage
    })),
    recentErrors: recentErrors.map(row => ({
      id: row.id,
      createdAt: row.createdAt,
      ticketId: row.ticketId,
      error: row.error
    })),
    operational: {
      startedByAi,
      resolvedByAiTickets,
      transferredTickets,
      handoffPending,
      humanHandling,
      closedByHuman,
      aiResolutionRate,
      avgHandoffWaitSeconds,
      handoffsByQueue: handoffsByQueue.map(row => ({
        queueName: row.queueName || "Sem fila",
        count: Number(row.count) || 0
      })),
      handoffsByReason: handoffsByReasonRaw.map(row => ({
        reason: row.aiHandoffReason,
        label:
          AI_HANDOFF_REASON_LABELS[row.aiHandoffReason] || row.aiHandoffReason,
        count: Number(row.count) || 0
      }))
    }
  };
};
