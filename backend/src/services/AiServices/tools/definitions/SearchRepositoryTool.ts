import {
  AiTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult
} from "../ToolRegistry";
import { searchRepositoryForAi } from "../../../ContentRepository/ContentRepositoryService";
import sendRepositoryItemToTicket from "../../../ContentRepository/SendContentRepositoryItemService";

const searchDefinition: ToolDefinition = {
  id: "search_repository",
  name: "search_repository",
  description:
    "Busca itens ativos do Repositório de conteúdos autorizados para IA (links, PDFs, imagens, modelos).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Termo de busca ou intenção" },
      contentType: { type: "string", description: "Tipo de conteúdo" },
      category: { type: "string", description: "Categoria" },
      tag: { type: "string", description: "Tag" },
      limit: { type: "number", description: "Limite de resultados" }
    },
    required: ["query"]
  },
  riskLevel: "read",
  enabled: true,
  allowedOverrideParams: []
};

export const SearchRepositoryTool: AiTool = {
  definition: searchDefinition,
  execute: async (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    const query = String(input.query || context.userText || "").trim();
    if (!query) {
      return {
        success: false,
        output: JSON.stringify({ error: "missing_query" }),
        errorCode: "missing_query"
      };
    }

    const items = await searchRepositoryForAi({
      companyId: context.companyId,
      query,
      contentType: input.contentType ? String(input.contentType) : undefined,
      category: input.category ? String(input.category) : undefined,
      tag: input.tag ? String(input.tag) : undefined,
      queueId: context.queueId,
      aiAgentId: context.aiAgentId,
      limit: input.limit ? Number(input.limit) : 8
    });

    return {
      success: true,
      output: JSON.stringify({
        query,
        count: items.length,
        items
      })
    };
  }
};

const sendDefinition: ToolDefinition = {
  id: "send_repository_item",
  name: "send_repository_item",
  description:
    "Envia ao cliente um item do Repositório previamente localizado (somente IDs retornados por search_repository).",
  parameters: {
    type: "object",
    properties: {
      itemId: {
        type: "number",
        description: "ID exato do item retornado por search_repository"
      },
      caption: {
        type: "string",
        description: "Legenda opcional (usa padrão do item se omitida)"
      },
      reason: {
        type: "string",
        description: "Motivo curto da escolha do material"
      }
    },
    required: ["itemId"]
  },
  riskLevel: "write",
  enabled: true,
  allowedOverrideParams: []
};

export const SendRepositoryItemTool: AiTool = {
  definition: sendDefinition,
  execute: async (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    const itemId = Number(input.itemId);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return {
        success: false,
        output: JSON.stringify({ error: "invalid_item_id" }),
        errorCode: "invalid_item_id"
      };
    }

    try {
      const result = await sendRepositoryItemToTicket({
        companyId: context.companyId,
        ticketId: context.ticketId,
        itemId,
        userId: context.userId || 0,
        profile: "admin",
        caption: input.caption ? String(input.caption) : undefined,
        sentByAi: true,
        aiAgentId: context.aiAgentId,
        reason: input.reason ? String(input.reason) : undefined
      });

      return {
        success: true,
        output: JSON.stringify({
          sent: true,
          itemId: result.item.id,
          itemName: result.item.name,
          messageType: result.messageType
        })
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "send_failed";
      return {
        success: false,
        output: JSON.stringify({
          error: message,
          code: message
        }),
        errorCode: message
      };
    }
  }
};
