import { Request, Response } from "express";
import AppError from "../errors/AppError";
import AiAgent from "../models/AiAgent";
import {
  getToolsStatus,
  isToolsEnabledForCompany
} from "../services/AiServices/tools/AiToolsFeatureFlag";
import { getWriteToolsStatus } from "../services/AiServices/tools/AiWriteToolsFeatureFlag";
import {
  listAgentToolBindings,
  syncAgentTools
} from "../services/AiServices/tools/AiAgentToolService";
import { listTools } from "../services/AiServices/tools/ToolRegistry";
import { listToolExecutionLogs } from "../services/AiServices/tools/ToolExecutorService";
import "../services/AiServices/tools/registerPilotTools";

export const toolsStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const payload = await getToolsStatus(companyId);
  return res.json(payload);
};

export const writeToolsStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const payload = await getWriteToolsStatus(companyId);
  return res.json(payload);
};

export const listRegisteredTools = async (
  _req: Request,
  res: Response
): Promise<Response> => res.json(listTools());

export const listAgentTools = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const agentId = Number(req.params.agentId);

  if (!Number.isFinite(agentId) || agentId <= 0) {
    throw new AppError("Invalid agentId", 400);
  }

  const agent = await AiAgent.findOne({ where: { id: agentId, companyId } });
  if (!agent) {
    throw new AppError("Agent not found", 404);
  }

  const tools = await listAgentToolBindings(companyId, agentId);
  return res.json({ agentId, tools });
};

export const updateAgentTools = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const agentId = Number(req.params.agentId);

  if (!Number.isFinite(agentId) || agentId <= 0) {
    throw new AppError("Invalid agentId", 400);
  }

  const tools = Array.isArray(req.body.tools) ? req.body.tools : [];
  const toolsRuntimeEnabled = await isToolsEnabledForCompany(companyId);

  try {
    await syncAgentTools({
      companyId,
      aiAgentId: agentId,
      tools: tools.map(
        (tool: {
          toolId: string;
          enabled?: boolean;
          config?: Record<string, unknown> | null;
        }) => ({
          toolId: String(tool.toolId),
          enabled: tool.enabled === true,
          config: tool.config || null
        })
      )
    });
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Failed to sync tools",
      400
    );
  }

  const bindings = await listAgentToolBindings(companyId, agentId);
  return res.json({
    agentId,
    tools: bindings,
    runtimeEnabled: toolsRuntimeEnabled,
    warning: toolsRuntimeEnabled ? null : "ERR_AI_TOOLS_DISABLED_RUNTIME"
  });
};

export const toolExecutions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const ticketId = req.query.ticketId ? Number(req.query.ticketId) : undefined;
  const contactId = req.query.contactId
    ? Number(req.query.contactId)
    : undefined;
  const riskLevel = req.query.riskLevel
    ? String(req.query.riskLevel)
    : undefined;

  const logs = await listToolExecutionLogs({
    companyId,
    ticketId,
    contactId,
    riskLevel,
    limit: req.query.limit ? Number(req.query.limit) : 50
  });

  return res.json(logs);
};
