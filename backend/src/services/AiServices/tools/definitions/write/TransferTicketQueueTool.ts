import Queue from "../../../../../models/Queue";
import Ticket from "../../../../../models/Ticket";
import UpdateTicketService from "../../../../TicketServices/UpdateTicketService";
import {
  AiTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult
} from "../../ToolRegistry";
import {
  buildMutationTarget,
  isQueueAllowedForAgent
} from "../../ToolGovernancePolicy";

const definition: ToolDefinition = {
  id: "transfer_ticket_queue",
  name: "transfer_ticket_queue",
  description:
    "Transfere o ticket para outra fila permitida ao agente. Use queueId ou queueName.",
  parameters: {
    type: "object",
    properties: {
      queueId: { type: "number", description: "ID da fila destino" },
      queueName: { type: "string", description: "Nome exato da fila" }
    },
    required: []
  },
  riskLevel: "write",
  enabled: true,
  allowedOverrideParams: []
};

export const TransferTicketQueueTool: AiTool = {
  definition,
  execute: async (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    let queueId = Number(input.queueId);
    if (!Number.isFinite(queueId) || queueId <= 0) {
      const queueName = String(input.queueName || "").trim();
      if (!queueName) {
        return {
          success: false,
          output: JSON.stringify({ error: "queue_id_or_name_required" }),
          errorCode: "invalid_input"
        };
      }

      const queue = await Queue.findOne({
        where: { companyId: context.companyId, name: queueName }
      });

      if (!queue) {
        return {
          success: false,
          output: JSON.stringify({ error: "queue_not_found", queueName }),
          errorCode: "queue_not_found"
        };
      }

      queueId = queue.id;
    }

    const allowed = await isQueueAllowedForAgent({
      companyId: context.companyId,
      aiAgentId: context.aiAgentId,
      queueId
    });

    if (!allowed) {
      return {
        success: false,
        output: JSON.stringify({ error: "queue_not_allowed_for_agent" }),
        errorCode: "queue_not_allowed"
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

    const previousQueueId = ticket.queueId;

    if (ticket.queueId === queueId) {
      return {
        success: true,
        output: JSON.stringify({
          action: "transfer_ticket_queue",
          status: "unchanged",
          queueId,
          mutationTarget: buildMutationTarget(definition.id, queueId),
          mutationTargetId: String(queueId)
        })
      };
    }

    await UpdateTicketService({
      ticketData: { queueId },
      ticketId: context.ticketId,
      companyId: context.companyId
    });

    return {
      success: true,
      output: JSON.stringify({
        action: "transfer_ticket_queue",
        status: "executed",
        queueId,
        mutationTarget: buildMutationTarget(definition.id, queueId),
        mutationTargetId: String(queueId),
        previousState: { queueId: previousQueueId },
        newState: { queueId }
      })
    };
  }
};
