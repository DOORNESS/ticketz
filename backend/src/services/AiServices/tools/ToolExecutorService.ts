import AiToolExecutionLog from "../../../models/AiToolExecutionLog";
import { logger } from "../../../utils/logger";
import {
  AiTool,
  ToolExecutionContext,
  ToolExecutionResult,
  isWriteRiskLevel
} from "./ToolRegistry";
import {
  getToolLogRetentionDays,
  sanitizeToolLogPayload
} from "./ToolLogSanitizer";
import {
  sanitizeToolOutput,
  wrapOperationalToolContent
} from "./ToolOutputSanitizer";
import { canExecuteTool, buildMutationTarget } from "./ToolGovernancePolicy";
import { validateToolInput } from "./ToolInputValidator";
import {
  buildCorrelationId,
  buildToolIdempotencyKey,
  executeWithPersistentIdempotency
} from "./ToolPersistentIdempotencyService";

const IMMUTABLE_PARAMS = new Set([
  "companyId",
  "contactId",
  "ticketId",
  "agentId",
  "aiAgentId",
  "queueId",
  "userId"
]);

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getToolTimeoutMs = (): number =>
  parsePositiveInt(process.env.AI_TOOL_TIMEOUT_MS, 5000);

const stripImmutableParams = (
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  tool: AiTool
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = { ...input };
  let blocked = false;

  Object.keys(sanitized).forEach(key => {
    if (
      IMMUTABLE_PARAMS.has(key) &&
      !tool.definition.allowedOverrideParams.includes(key)
    ) {
      delete sanitized[key];
      blocked = true;
    }
  });

  if (blocked) {
    logger.warn(
      { toolId: tool.definition.id, ticketId: context.ticketId },
      "parameter_override_blocked"
    );
  }

  return sanitized;
};

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: string
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorCode)), timeoutMs);
    })
  ]);

const requiresPersistentIdempotency = (tool: AiTool): boolean =>
  isWriteRiskLevel(tool.definition.riskLevel) ||
  tool.definition.riskLevel === "handoff";

export type ExecutedToolCall = {
  toolId: string;
  toolCallId: string;
  success: boolean;
  wrappedOutput: string;
  rawOutput: string;
  errorCode?: string;
  latencyMs: number;
  handoffTriggered?: boolean;
  reusedResult?: boolean;
};

const runToolExecute = async (
  tool: AiTool,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> =>
  withTimeout(tool.execute(args, context), getToolTimeoutMs(), "tool_timeout");

export const executeToolCall = async (input: {
  tool: AiTool;
  toolCallId: string;
  args: Record<string, unknown>;
  context: ToolExecutionContext;
  iteration: number;
}): Promise<ExecutedToolCall> => {
  const startedAt = Date.now();
  const strippedArgs = stripImmutableParams(
    input.args,
    input.context,
    input.tool
  );

  const inputValidation = validateToolInput(
    input.tool.definition,
    strippedArgs
  );

  let result: ToolExecutionResult;
  let reusedResult = false;
  let idempotencyKey: string | null = null;
  const correlationId = buildCorrelationId({
    companyId: input.context.companyId,
    toolId: input.tool.definition.id,
    toolCallId: input.toolCallId
  });

  const logInput = inputValidation.valid
    ? inputValidation.sanitized
    : strippedArgs;

  if (!inputValidation.valid) {
    result = {
      success: false,
      output: JSON.stringify({ error: inputValidation.errorCode }),
      errorCode: inputValidation.errorCode
    };
  } else {
    const governance = await canExecuteTool({
      companyId: input.context.companyId,
      tool: input.tool,
      context: input.context
    });

    if (!governance.allowed) {
      result = {
        success: false,
        output: JSON.stringify({
          error: governance.errorCode,
          message: governance.message
        }),
        errorCode: governance.errorCode
      };
    } else if (requiresPersistentIdempotency(input.tool)) {
      idempotencyKey = buildToolIdempotencyKey({
        toolId: input.tool.definition.id,
        ticketId: input.context.ticketId || 0,
        contactId: input.context.contactId || 0,
        payload: inputValidation.sanitized
      });

      try {
        const persisted = await executeWithPersistentIdempotency({
          companyId: input.context.companyId,
          toolId: input.tool.definition.id,
          ticketId: input.context.ticketId || 0,
          contactId: input.context.contactId || 0,
          aiAgentId: input.context.aiAgentId,
          idempotencyKey,
          correlationId,
          execute: () =>
            runToolExecute(input.tool, inputValidation.sanitized, input.context)
        });
        result = persisted.result;
        reusedResult = persisted.reused;
      } catch (error) {
        result = {
          success: false,
          output: JSON.stringify({
            error:
              error instanceof Error ? error.message : "tool_execution_failed"
          }),
          errorCode: "tool_execution_failed"
        };
      }
    } else {
      try {
        result = await runToolExecute(
          input.tool,
          inputValidation.sanitized,
          input.context
        );
      } catch (error) {
        result = {
          success: false,
          output: JSON.stringify({
            error:
              error instanceof Error ? error.message : "tool_execution_failed"
          }),
          errorCode:
            error instanceof Error && error.message === "tool_timeout"
              ? "tool_timeout"
              : "tool_execution_failed"
        };
      }
    }
  }

  const sanitizedOutput = sanitizeToolOutput(result.output);
  const wrappedOutput = wrapOperationalToolContent(sanitizedOutput.output);
  const latencyMs = Date.now() - startedAt;

  const inputLog = sanitizeToolLogPayload(logInput);
  const outputLog = sanitizeToolLogPayload(sanitizedOutput.output);

  const retentionDays = getToolLogRetentionDays();
  const retentionExpiresAt = new Date();
  retentionExpiresAt.setDate(retentionExpiresAt.getDate() + retentionDays);

  let mutationTarget: string | null = null;
  let mutationTargetId: string | null = null;
  let previousStateSanitized: string | null = null;
  let newStateSanitized: string | null = null;

  if (result.success) {
    try {
      const parsed = JSON.parse(sanitizedOutput.output) as {
        mutationTarget?: string;
        mutationTargetId?: string;
        previousState?: Record<string, unknown>;
        newState?: Record<string, unknown>;
      };
      mutationTarget = parsed.mutationTarget || null;
      mutationTargetId = parsed.mutationTargetId || null;
      if (parsed.previousState) {
        previousStateSanitized = sanitizeToolLogPayload(
          parsed.previousState
        ).value;
      }
      if (parsed.newState) {
        newStateSanitized = sanitizeToolLogPayload(parsed.newState).value;
      }
    } catch {
      if (isWriteRiskLevel(input.tool.definition.riskLevel)) {
        mutationTarget = buildMutationTarget(
          input.tool.definition.id,
          input.context.ticketId
        );
      }
    }
  }

  await AiToolExecutionLog.create({
    companyId: input.context.companyId,
    ticketId: input.context.ticketId,
    contactId: input.context.contactId,
    aiAgentId: input.context.aiAgentId,
    toolId: input.tool.definition.id,
    iteration: input.iteration,
    inputSanitized: inputLog.value,
    outputSanitized: outputLog.value,
    success: result.success,
    errorCode: result.errorCode || null,
    latencyMs,
    riskLevel: input.tool.definition.riskLevel,
    mutationTarget,
    mutationTargetId,
    idempotencyKey,
    correlationId,
    attempt: input.iteration,
    reusedResult,
    previousStateSanitized,
    newStateSanitized,
    reversible: isWriteRiskLevel(input.tool.definition.riskLevel),
    executedByAgentId: input.context.aiAgentId,
    retentionExpiresAt
  });

  return {
    toolId: input.tool.definition.id,
    toolCallId: input.toolCallId,
    success: result.success,
    wrappedOutput,
    rawOutput: sanitizedOutput.output,
    errorCode: result.errorCode,
    latencyMs,
    handoffTriggered: result.handoffTriggered,
    reusedResult
  };
};

export const listToolExecutionLogs = async (input: {
  companyId: number;
  ticketId?: number;
  contactId?: number;
  riskLevel?: string;
  limit?: number;
  offset?: number;
}): Promise<AiToolExecutionLog[]> =>
  AiToolExecutionLog.findAll({
    where: {
      companyId: input.companyId,
      ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {})
    },
    order: [["createdAt", "DESC"]],
    limit: input.limit || 50,
    offset: input.offset || 0
  });
