import Tag from "../../../../../models/Tag";
import TicketTag from "../../../../../models/TicketTag";
import Ticket from "../../../../../models/Ticket";
import {
  AiTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult
} from "../../ToolRegistry";
import { ticketTagAdd } from "../../../../TicketTagServices/TicketTagServices";
import {
  buildMutationTarget,
  isTagAllowedForCompany
} from "../../ToolGovernancePolicy";

const definition: ToolDefinition = {
  id: "add_ticket_tag",
  name: "add_ticket_tag",
  description:
    "Adiciona uma tag existente ao ticket atual. Use tagId ou tagName.",
  parameters: {
    type: "object",
    properties: {
      tagId: { type: "number", description: "ID da tag" },
      tagName: { type: "string", description: "Nome exato da tag" }
    },
    required: []
  },
  riskLevel: "write",
  enabled: true,
  allowedOverrideParams: []
};

export const AddTicketTagTool: AiTool = {
  definition,
  execute: async (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    let tagId = Number(input.tagId);
    if (!Number.isFinite(tagId) || tagId <= 0) {
      const tagName = String(input.tagName || "").trim();
      if (!tagName) {
        return {
          success: false,
          output: JSON.stringify({ error: "tag_id_or_name_required" }),
          errorCode: "invalid_input"
        };
      }

      const tag = await Tag.findOne({
        where: { companyId: context.companyId, name: tagName }
      });

      if (!tag) {
        return {
          success: false,
          output: JSON.stringify({ error: "tag_not_found", tagName }),
          errorCode: "tag_not_found"
        };
      }

      tagId = tag.id;
    }

    if (!(await isTagAllowedForCompany(context.companyId, tagId))) {
      return {
        success: false,
        output: JSON.stringify({ error: "tag_not_found" }),
        errorCode: "tag_not_found"
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

    const existing = await TicketTag.findOne({
      where: { ticketId: context.ticketId, tagId }
    });

    if (existing) {
      return {
        success: true,
        output: JSON.stringify({
          action: "add_ticket_tag",
          status: "already_present",
          tagId,
          mutationTarget: buildMutationTarget(definition.id, tagId),
          mutationTargetId: String(tagId)
        })
      };
    }

    await ticketTagAdd(context.ticketId, tagId, context.companyId);

    return {
      success: true,
      output: JSON.stringify({
        action: "add_ticket_tag",
        status: "executed",
        tagId,
        mutationTarget: buildMutationTarget(definition.id, tagId),
        mutationTargetId: String(tagId),
        previousState: { tagIds: [] },
        newState: { tagId }
      })
    };
  }
};
