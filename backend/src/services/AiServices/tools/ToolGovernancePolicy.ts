import Ticket from "../../../models/Ticket";
import AiAgent from "../../../models/AiAgent";
import Contact from "../../../models/Contact";
import AiAgentQueue from "../../../models/AiAgentQueue";
import Tag from "../../../models/Tag";
import Schedule from "../../../models/Schedule";
import { Op } from "sequelize";
import { AiTool, ToolExecutionContext } from "./ToolRegistry";
import { isWriteToolsEnabledForCompany } from "./AiWriteToolsFeatureFlag";
import { isToolsEnabledForCompany } from "./AiToolsFeatureFlag";

export type GovernanceDecision = {
  allowed: boolean;
  errorCode?: string;
  message?: string;
};

const isWriteRisk = (tool: AiTool): boolean =>
  tool.definition.riskLevel === "write" ||
  tool.definition.riskLevel === "destructive";

export const canExecuteTool = async (input: {
  companyId: number;
  tool: AiTool;
  context: ToolExecutionContext;
}): Promise<GovernanceDecision> => {
  const { tool, context, companyId } = input;

  if (context.companyId !== companyId) {
    return { allowed: false, errorCode: "company_mismatch" };
  }

  const toolsEnabled = await isToolsEnabledForCompany(companyId);
  if (!toolsEnabled) {
    return { allowed: false, errorCode: "tools_disabled" };
  }

  const agent = await AiAgent.findOne({
    where: { id: context.aiAgentId, companyId }
  });
  if (!agent) {
    return { allowed: false, errorCode: "agent_not_found" };
  }

  if (context.contactId) {
    const contact = await Contact.findOne({
      where: { id: context.contactId, companyId }
    });
    if (!contact) {
      return { allowed: false, errorCode: "contact_not_found" };
    }
  }

  if (!isWriteRisk(tool)) {
    return { allowed: true };
  }

  const writeEnabled = await isWriteToolsEnabledForCompany(companyId);
  if (!writeEnabled) {
    return {
      allowed: false,
      errorCode: "write_tools_disabled",
      message: "Write tools are disabled for this company"
    };
  }

  if (!context.ticketId) {
    return {
      allowed: false,
      errorCode: "ticket_required",
      message: "Write tools require an active ticket context"
    };
  }

  const ticket = await Ticket.findOne({
    where: { id: context.ticketId, companyId: context.companyId }
  });

  if (!ticket) {
    return { allowed: false, errorCode: "ticket_not_found" };
  }

  if (ticket.status === "closed") {
    return { allowed: false, errorCode: "ticket_closed" };
  }

  if (ticket.userId) {
    return {
      allowed: false,
      errorCode: "human_active",
      message: "Write tools blocked while a human agent is assigned"
    };
  }

  return { allowed: true };
};

export const isQueueAllowedForAgent = async (input: {
  companyId: number;
  aiAgentId: number;
  queueId: number;
}): Promise<boolean> => {
  const links = await AiAgentQueue.findAll({
    where: { companyId: input.companyId, aiAgentId: input.aiAgentId }
  });

  if (!links.length) {
    return true;
  }

  return links.some(link => link.queueId === input.queueId);
};

export const isTagAllowedForCompany = async (
  companyId: number,
  tagId: number
): Promise<boolean> => {
  const tag = await Tag.findOne({ where: { id: tagId, companyId } });
  return Boolean(tag);
};

export const countRecentSchedulesForContact = async (input: {
  companyId: number;
  contactId: number;
  hours?: number;
}): Promise<number> => {
  const since = new Date();
  since.setHours(since.getHours() - (input.hours || 24));

  return Schedule.count({
    where: {
      companyId: input.companyId,
      contactId: input.contactId,
      createdAt: { [Op.gte]: since },
      status: { [Op.ne]: "ENVIADA" }
    }
  });
};

export const hasRecentScheduleForContact = async (input: {
  companyId: number;
  contactId: number;
  hours?: number;
}): Promise<boolean> => (await countRecentSchedulesForContact(input)) > 0;

export const buildMutationTarget = (
  toolId: string,
  targetId?: number | string | null
): string => `${toolId}:${targetId ?? "none"}`;
