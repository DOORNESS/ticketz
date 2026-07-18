import Ticket from "../../../../../models/Ticket";
import UpdateTicketService from "../../../../TicketServices/UpdateTicketService";
import {
  AiTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult
} from "../../ToolRegistry";
import { buildMutationTarget } from "../../ToolGovernancePolicy";

const ALLOWED_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

const definition: ToolDefinition = {
  id: "update_ticket_priority",
  name: "update_ticket_priority",
  description:
    "Atualiza aiPriority do ticket (campo operacional IA oficial do Ticketz).",
  parameters: {
    type: "object",
    properties: {
      priority: {
        type: "string",
        enum: ["low", "normal", "high", "urgent"],
        description: "Nova prioridade IA"
      }
    },
    required: ["priority"]
  },
  riskLevel: "write",
  enabled: true,
  allowedOverrideParams: []
};

export const UpdateTicketPriorityTool: AiTool = {
  definition,
  execute: async (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    const priority = String(input.priority || "")
      .trim()
      .toLowerCase();

    if (!ALLOWED_PRIORITIES.has(priority)) {
      return {
        success: false,
        output: JSON.stringify({ error: "invalid_priority" }),
        errorCode: "invalid_input"
      };
    }

    const ticket = await Ticket.findOne({
      where: { id: context.ticketId, companyId: context.companyId }
    });

    if (!ticket) {
      return {
        success: false,
        output: JSON.stringify({ error: "ticket_not_found" }),
        errorCode: "ticket_not_found"
      };
    }

    const previousPriority = ticket.aiPriority;

    if (ticket.aiPriority === priority) {
      return {
        success: true,
        output: JSON.stringify({
          action: "update_ticket_priority",
          status: "unchanged",
          priority,
          field: "aiPriority",
          mutationTarget: buildMutationTarget(definition.id, priority),
          mutationTargetId: priority
        })
      };
    }

    await UpdateTicketService({
      ticketData: { aiPriority: priority },
      ticketId: context.ticketId,
      companyId: context.companyId
    });

    return {
      success: true,
      output: JSON.stringify({
        action: "update_ticket_priority",
        status: "executed",
        priority,
        field: "aiPriority",
        mutationTarget: buildMutationTarget(definition.id, priority),
        mutationTargetId: priority,
        previousState: { aiPriority: previousPriority },
        newState: { aiPriority: priority }
      })
    };
  }
};
