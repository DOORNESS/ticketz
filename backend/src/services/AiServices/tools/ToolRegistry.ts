export type JSONSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
};

export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema;
  riskLevel: "read" | "handoff" | "write" | "destructive";
  enabled: boolean;
  allowedOverrideParams: string[];
};

export type ToolExecutionContext = {
  companyId: number;
  aiAgentId: number;
  ticketId: number;
  contactId: number;
  queueId?: number | null;
  userId?: number | null;
  userText?: string;
  conversationText?: string;
  knowledgeBaseIds?: number[];
  providerId?: string;
};

export type ToolExecutionResult = {
  success: boolean;
  output: string;
  errorCode?: string;
  handoffTriggered?: boolean;
};

export interface AiTool {
  definition: ToolDefinition;
  execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult>;
}

const registeredTools: AiTool[] = [];

const ensureToolsLoaded = (): void => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ensurePilotToolsRegistered } = require("./registerPilotTools");
  ensurePilotToolsRegistered();
};

export const resetToolRegistryForTests = (): void => {
  registeredTools.length = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const registerModule = require("./registerPilotTools") as {
    resetPilotToolsRegistrationForTests?: () => void;
  };
  registerModule.resetPilotToolsRegistrationForTests?.();
};

export const registerTool = (tool: AiTool): void => {
  const existingIndex = registeredTools.findIndex(
    item => item.definition.id === tool.definition.id
  );

  if (existingIndex >= 0) {
    registeredTools[existingIndex] = tool;
    return;
  }

  registeredTools.push(tool);
};

export const registerTools = (tools: AiTool[]): void => {
  tools.forEach(registerTool);
};

export const listTools = (): ToolDefinition[] => {
  ensureToolsLoaded();
  return registeredTools.map(tool => tool.definition);
};

export const getToolById = (toolId: string): AiTool | undefined => {
  ensureToolsLoaded();
  return registeredTools.find(tool => tool.definition.id === toolId);
};

export const getAllowedTools = (allowedToolIds: string[]): AiTool[] => {
  ensureToolsLoaded();
  return registeredTools.filter(
    tool =>
      tool.definition.enabled && allowedToolIds.includes(tool.definition.id)
  );
};

export const isToolCallingSupported = (providerId?: string): boolean => {
  const normalized = String(providerId || "openai").toLowerCase();
  return (
    normalized === "openai" ||
    normalized === "groq" ||
    normalized === "openrouter" ||
    normalized === "gemini"
  );
};

export const isWriteRiskLevel = (riskLevel: string): boolean =>
  riskLevel === "write" || riskLevel === "destructive";
