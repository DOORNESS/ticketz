import CreateScheduleService from "../../../../ScheduleServices/CreateService";
import Contact from "../../../../../models/Contact";
import {
  AiTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult
} from "../../ToolRegistry";
import {
  buildMutationTarget,
  countRecentSchedulesForContact
} from "../../ToolGovernancePolicy";

const MAX_SCHEDULES_PER_DAY = (): number => {
  const parsed = Number(process.env.AI_SCHEDULE_MAX_PER_CONTACT_DAY || "1");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const MAX_DAYS_AHEAD = (): number => {
  const parsed = Number(process.env.AI_SCHEDULE_MAX_DAYS_AHEAD || "30");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

const definition: ToolDefinition = {
  id: "schedule_followup",
  name: "schedule_followup",
  description:
    "Agenda um follow-up WhatsApp para o contato em data/hora futura (ISO 8601).",
  parameters: {
    type: "object",
    properties: {
      sendAt: {
        type: "string",
        description: "Data/hora ISO 8601 no futuro"
      },
      message: {
        type: "string",
        description: "Mensagem a enviar no follow-up"
      }
    },
    required: ["sendAt", "message"]
  },
  riskLevel: "write",
  enabled: true,
  allowedOverrideParams: []
};

export const ScheduleFollowupTool: AiTool = {
  definition,
  execute: async (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    if (!context.contactId) {
      return {
        success: false,
        output: JSON.stringify({ error: "contact_required" }),
        errorCode: "contact_required"
      };
    }

    const contact = await Contact.findOne({
      where: { id: context.contactId, companyId: context.companyId }
    });

    if (!contact) {
      return {
        success: false,
        output: JSON.stringify({ error: "contact_not_found" }),
        errorCode: "contact_not_found"
      };
    }

    const sendAtRaw = String(input.sendAt || "").trim();
    const message = String(input.message || "").trim();
    const sendAt = new Date(sendAtRaw);
    const now = new Date();

    if (!sendAtRaw || Number.isNaN(sendAt.getTime()) || sendAt <= now) {
      return {
        success: false,
        output: JSON.stringify({ error: "invalid_send_at" }),
        errorCode: "invalid_input"
      };
    }

    const maxAhead = new Date(now);
    maxAhead.setDate(maxAhead.getDate() + MAX_DAYS_AHEAD());
    if (sendAt > maxAhead) {
      return {
        success: false,
        output: JSON.stringify({ error: "send_at_too_far" }),
        errorCode: "invalid_input"
      };
    }

    if (message.length < 5 || message.length > 1000) {
      return {
        success: false,
        output: JSON.stringify({ error: "message_length_invalid" }),
        errorCode: "invalid_input"
      };
    }

    const recentCount = await countRecentSchedulesForContact({
      companyId: context.companyId,
      contactId: context.contactId,
      hours: 24
    });

    if (recentCount >= MAX_SCHEDULES_PER_DAY()) {
      return {
        success: false,
        output: JSON.stringify({
          error: "schedule_rate_limited",
          message: "Limite diário de agendamentos atingido"
        }),
        errorCode: "rate_limited"
      };
    }

    const schedule = await CreateScheduleService({
      body: message,
      sendAt,
      contactId: context.contactId,
      companyId: context.companyId,
      saveMessage: true
    });

    return {
      success: true,
      output: JSON.stringify({
        action: "schedule_followup",
        status: "executed",
        scheduleId: schedule.id,
        sendAt: sendAt.toISOString(),
        mutationTarget: buildMutationTarget(definition.id, schedule.id),
        mutationTargetId: String(schedule.id),
        newState: {
          scheduleId: schedule.id,
          sendAt: sendAt.toISOString()
        }
      })
    };
  }
};
