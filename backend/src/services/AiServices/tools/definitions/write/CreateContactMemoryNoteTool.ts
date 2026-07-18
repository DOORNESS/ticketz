import { upsertContactMemoryRecord } from "../../../ContactMemory/ContactAiMemoryService";
import {
  AiTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult
} from "../../ToolRegistry";
import { buildMutationTarget } from "../../ToolGovernancePolicy";

const definition: ToolDefinition = {
  id: "create_contact_memory_note",
  name: "create_contact_memory_note",
  description:
    "Registra uma nota do agente IA na memória do contato (não verificada por humano).",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Chave curta da nota (ex: preferencia_horario)"
      },
      value: {
        type: "string",
        description: "Conteúdo da nota"
      }
    },
    required: ["key", "value"]
  },
  riskLevel: "write",
  enabled: true,
  allowedOverrideParams: []
};

export const CreateContactMemoryNoteTool: AiTool = {
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

    const key = String(input.key || "")
      .trim()
      .slice(0, 128);
    const value = String(input.value || "")
      .trim()
      .slice(0, 2000);

    if (!key || value.length < 3) {
      return {
        success: false,
        output: JSON.stringify({ error: "invalid_note" }),
        errorCode: "invalid_input"
      };
    }

    const record = await upsertContactMemoryRecord({
      companyId: context.companyId,
      contactId: context.contactId,
      memoryType: "agent_note",
      category: null,
      key,
      value,
      verificationStatus: "unverified",
      source: "agent",
      sourceTicketId: context.ticketId || null,
      actorType: "ai_agent",
      aiAgentId: context.aiAgentId
    });

    return {
      success: true,
      output: JSON.stringify({
        action: "create_contact_memory_note",
        status: "executed",
        memoryId: record.id,
        memoryType: "agent_note",
        verificationStatus: "unverified",
        source: "agent",
        mutationTarget: buildMutationTarget(definition.id, record.id),
        mutationTargetId: String(record.id),
        newState: {
          memoryType: "agent_note",
          verificationStatus: "unverified",
          key
        }
      })
    };
  }
};
