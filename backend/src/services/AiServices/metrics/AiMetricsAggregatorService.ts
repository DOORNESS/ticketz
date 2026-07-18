import { Op, fn, col, literal, QueryTypes } from "sequelize";
import sequelize from "../../../database";
import AiConversationLog from "../../../models/AiConversationLog";
import AiToolExecutionLog from "../../../models/AiToolExecutionLog";
import AiRoutingLog from "../../../models/AiRoutingLog";
import ContactAiMemory from "../../../models/ContactAiMemory";
import { estimateCostUsd } from "../pricing/AiPricingCatalog";

export type AggregatedMetrics = {
  tools: {
    executions: number;
    successRate: number;
    writeExecutions: number;
    avgLatencyMs: number | null;
    byTool: Array<{ toolId: string; count: number }>;
  };
  memory: {
    recordsApplied: number;
    activeRecords: number;
  };
  orchestrator: {
    routed: number;
    avgConfidence: number | null;
    fallbacks: number;
  };
  byAgent: Array<{
    agentId: number;
    name: string;
    costUsd: number;
    conversations: number;
  }>;
};

export const aggregateCompanyMetrics = async (
  companyId: number,
  since: Date
): Promise<AggregatedMetrics> => {
  const [toolSummary, toolByIdRows] = await Promise.all([
    AiToolExecutionLog.findAll({
      attributes: [
        [fn("COUNT", col("id")), "executions"],
        [
          fn("SUM", literal(`CASE WHEN success = true THEN 1 ELSE 0 END`)),
          "successCount"
        ],
        [
          fn(
            "SUM",
            literal(`CASE WHEN "riskLevel" = 'write' THEN 1 ELSE 0 END`)
          ),
          "writeExecutions"
        ],
        [fn("AVG", col("latencyMs")), "avgLatencyMs"]
      ],
      where: { companyId, createdAt: { [Op.gte]: since } },
      raw: true
    }),
    AiToolExecutionLog.findAll({
      attributes: ["toolId", [fn("COUNT", col("id")), "count"]],
      where: { companyId, createdAt: { [Op.gte]: since } },
      group: ["toolId"],
      raw: true
    })
  ]);

  const summary = toolSummary[0] as unknown as {
    executions: string;
    successCount: string;
    writeExecutions: string;
    avgLatencyMs: string;
  };

  const executions = Number(summary?.executions) || 0;
  const successCount = Number(summary?.successCount) || 0;
  const writeExecutions = Number(summary?.writeExecutions) || 0;
  const avgLatencyMs = summary?.avgLatencyMs
    ? Math.round(Number(summary.avgLatencyMs))
    : null;

  const byTool = (
    toolByIdRows as unknown as Array<{ toolId: string; count: string }>
  )
    .map(row => ({
      toolId: row.toolId,
      count: Number(row.count) || 0
    }))
    .sort((a, b) => b.count - a.count);

  const [memoryApplied, activeRecords] = await Promise.all([
    ContactAiMemory.count({
      where: {
        companyId,
        updatedAt: { [Op.gte]: since },
        verificationStatus: {
          [Op.in]: ["user_stated", "system_verified", "human_verified"]
        }
      }
    }),
    ContactAiMemory.count({
      where: { companyId, active: true, deletedAt: null }
    })
  ]);

  const routingRows = (await AiRoutingLog.findAll({
    attributes: [
      [fn("AVG", col("confidence")), "avgConfidence"],
      [
        fn("SUM", literal(`CASE WHEN "fallbackUsed" = true THEN 1 ELSE 0 END`)),
        "fallbacks"
      ],
      [fn("COUNT", col("id")), "total"]
    ],
    where: { companyId, createdAt: { [Op.gte]: since } },
    raw: true
  })) as unknown as Array<{
    avgConfidence: string;
    fallbacks: string;
    total: string;
  }>;

  const routing = routingRows[0];

  const agentRows = (await sequelize.query(
    `
    SELECT log."aiAgentId" AS "agentId",
           agent.name AS name,
           COUNT(*)::int AS conversations,
           COALESCE(SUM(log."tokensInput"), 0)::int AS "tokensInput",
           COALESCE(SUM(log."tokensOutput"), 0)::int AS "tokensOutput",
           MAX(log.model) AS model
    FROM "AiConversationLogs" log
    LEFT JOIN "AiAgents" agent ON agent.id = log."aiAgentId"
    WHERE log."companyId" = :companyId
      AND log."createdAt" >= :since
      AND log."aiAgentId" IS NOT NULL
    GROUP BY log."aiAgentId", agent.name
    ORDER BY conversations DESC
    LIMIT 10
    `,
    {
      replacements: { companyId, since },
      type: QueryTypes.SELECT
    }
  )) as Array<{
    agentId: number;
    name: string;
    conversations: number;
    tokensInput: number;
    tokensOutput: number;
    model: string;
  }>;

  return {
    tools: {
      executions,
      successRate:
        executions > 0
          ? Math.round((successCount / executions) * 1000) / 1000
          : 0,
      writeExecutions,
      avgLatencyMs,
      byTool
    },
    memory: {
      recordsApplied: memoryApplied,
      activeRecords
    },
    orchestrator: {
      routed: Number(routing?.total) || 0,
      avgConfidence: routing?.avgConfidence
        ? Math.round(Number(routing.avgConfidence) * 1000) / 1000
        : null,
      fallbacks: Number(routing?.fallbacks) || 0
    },
    byAgent: agentRows.map(row => ({
      agentId: row.agentId,
      name: row.name || `Agent #${row.agentId}`,
      conversations: Number(row.conversations) || 0,
      costUsd: estimateCostUsd(
        row.model,
        Number(row.tokensInput) || 0,
        Number(row.tokensOutput) || 0
      )
    }))
  };
};

export const aggregateDailySnapshot = async (
  companyId: number,
  periodStart: Date
): Promise<Record<string, unknown>> => {
  const since = new Date(periodStart);
  since.setHours(0, 0, 0, 0);
  const until = new Date(since);
  until.setDate(until.getDate() + 1);

  const logs = await AiConversationLog.findAll({
    attributes: ["model", "tokensInput", "tokensOutput"],
    where: {
      companyId,
      createdAt: { [Op.gte]: since, [Op.lt]: until }
    },
    raw: true
  });

  const tokensInput = logs.reduce(
    (sum, row) => sum + (Number(row.tokensInput) || 0),
    0
  );
  const tokensOutput = logs.reduce(
    (sum, row) => sum + (Number(row.tokensOutput) || 0),
    0
  );

  const metrics = await aggregateCompanyMetrics(companyId, since);

  return {
    periodStart: since.toISOString(),
    conversations: logs.length,
    tokens: {
      input: tokensInput,
      output: tokensOutput,
      costUsd: logs.reduce(
        (sum, row) =>
          sum +
          estimateCostUsd(
            row.model,
            Number(row.tokensInput) || 0,
            Number(row.tokensOutput) || 0
          ),
        0
      )
    },
    ...metrics
  };
};
