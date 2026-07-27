import AiAgent from "../../../models/AiAgent";
import { chatCompletion, ChatMessage } from "../ModelGateway";
import { logger } from "../../../utils/logger";
import {
  getToolById,
  isToolCallingSupported,
  ToolDefinition,
  ToolExecutionContext,
  isWriteRiskLevel
} from "./ToolRegistry";
import { resolveExecutableTools } from "./AiAgentToolService";
import { executeToolCall } from "./ToolExecutorService";
import { isToolsEnabledForCompany } from "./AiToolsFeatureFlag";
import { isWriteToolsEnabledForCompany } from "./AiWriteToolsFeatureFlag";

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getMaxIterations = (): number =>
  parsePositiveInt(process.env.AI_TOOLS_MAX_ITERATIONS, 3);

const MAX_TOOLS_PER_TURN = 2;

export type ToolLoopResult = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  toolCallsExecuted: number;
  handoffTriggered: boolean;
  messages: ChatMessage[];
};

export const runToolLoop = async (input: {
  companyId: number;
  agent: AiAgent;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  context: ToolExecutionContext;
  disableTools?: boolean;
}): Promise<ToolLoopResult> => {
  if (input.disableTools) {
    const completion = await chatCompletion(input.companyId, {
      model: input.agent.textModel,
      temperature: input.agent.temperature,
      maxTokens: input.agent.maxTokens,
      providerId: input.agent.provider,
      messages: input.messages
    });

    return {
      content: completion.content,
      tokensInput: completion.tokensInput,
      tokensOutput: completion.tokensOutput,
      model: completion.model,
      toolCallsExecuted: 0,
      handoffTriggered: false,
      messages: input.messages
    };
  }

  const toolsEnabled = await isToolsEnabledForCompany(input.companyId);

  if (
    !toolsEnabled ||
    input.agent.role === "orchestrator" ||
    !isToolCallingSupported(input.agent.provider)
  ) {
    const completion = await chatCompletion(input.companyId, {
      model: input.agent.textModel,
      temperature: input.agent.temperature,
      maxTokens: input.agent.maxTokens,
      providerId: input.agent.provider,
      messages: input.messages
    });

    return {
      content: completion.content,
      tokensInput: completion.tokensInput,
      tokensOutput: completion.tokensOutput,
      model: completion.model,
      toolCallsExecuted: 0,
      handoffTriggered: false,
      messages: input.messages
    };
  }

  const writeToolsEnabled = await isWriteToolsEnabledForCompany(
    input.companyId
  );

  const filterToolsByRisk = (tools: ToolDefinition[]): ToolDefinition[] =>
    tools.filter(
      tool =>
        !isWriteRiskLevel(tool.riskLevel) ||
        (writeToolsEnabled && tool.riskLevel === "write")
    );

  const executableToolsRaw = input.tools?.length
    ? input.tools
    : (await resolveExecutableTools(input.companyId, input.agent.id)).map(
        tool => tool.definition
      );

  const executableTools = filterToolsByRisk(executableToolsRaw);

  if (!executableTools.length) {
    const completion = await chatCompletion(input.companyId, {
      model: input.agent.textModel,
      temperature: input.agent.temperature,
      maxTokens: input.agent.maxTokens,
      providerId: input.agent.provider,
      messages: input.messages
    });

    return {
      content: completion.content,
      tokensInput: completion.tokensInput,
      tokensOutput: completion.tokensOutput,
      model: completion.model,
      toolCallsExecuted: 0,
      handoffTriggered: false,
      messages: input.messages
    };
  }

  let messages = [...input.messages];
  let tokensInput = 0;
  let tokensOutput = 0;
  let model = input.agent.textModel;
  let toolCallsExecuted = 0;
  let handoffTriggered = false;

  for (let iteration = 1; iteration <= getMaxIterations(); iteration += 1) {
    const completion = await chatCompletion(input.companyId, {
      model: input.agent.textModel,
      temperature: input.agent.temperature,
      maxTokens: input.agent.maxTokens,
      providerId: input.agent.provider,
      messages,
      tools: executableTools,
      toolChoice: "auto"
    });

    tokensInput += completion.tokensInput;
    tokensOutput += completion.tokensOutput;
    model = completion.model;

    const toolCalls = (completion.toolCalls || []).slice(0, MAX_TOOLS_PER_TURN);

    if (!toolCalls.length) {
      return {
        content: completion.content,
        tokensInput,
        tokensOutput,
        model,
        toolCallsExecuted,
        handoffTriggered,
        messages
      };
    }

    messages = [
      ...messages,
      {
        role: "assistant",
        content: completion.content || "",
        tool_calls: toolCalls
      }
    ];

    await Promise.all(
      toolCalls.map(async call => {
        const tool = getToolById(call.name);
        if (!tool) {
          logger.warn(
            { toolName: call.name },
            "Unknown tool requested by model"
          );
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: wrapUnknownTool(call.name)
          });
          return;
        }

        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.arguments || "{}");
        } catch {
          parsedArgs = {};
        }

        const executed = await executeToolCall({
          tool,
          toolCallId: call.id,
          args: parsedArgs,
          context: input.context,
          iteration
        });

        toolCallsExecuted += 1;
        handoffTriggered =
          handoffTriggered || Boolean(executed.handoffTriggered);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: executed.wrappedOutput
        });
      })
    );

    if (handoffTriggered) {
      return {
        content:
          completion.content ||
          "Transferência para atendimento humano iniciada.",
        tokensInput,
        tokensOutput,
        model,
        toolCallsExecuted,
        handoffTriggered: true,
        messages
      };
    }
  }

  const finalCompletion = await chatCompletion(input.companyId, {
    model: input.agent.textModel,
    temperature: input.agent.temperature,
    maxTokens: input.agent.maxTokens,
    providerId: input.agent.provider,
    messages,
    toolChoice: "none"
  });

  return {
    content: finalCompletion.content,
    tokensInput: tokensInput + finalCompletion.tokensInput,
    tokensOutput: tokensOutput + finalCompletion.tokensOutput,
    model: finalCompletion.model,
    toolCallsExecuted,
    handoffTriggered,
    messages
  };
};

const wrapUnknownTool = (toolName: string): string =>
  `[OPERATIONAL_DATA]\n${JSON.stringify({ error: "unknown_tool", toolName })}\n[/OPERATIONAL_DATA]`;
