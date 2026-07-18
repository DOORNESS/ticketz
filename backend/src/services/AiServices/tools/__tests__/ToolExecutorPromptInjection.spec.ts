import { executeToolCall } from "../ToolExecutorService";
import { GetTicketStatusTool } from "../definitions/GetTicketStatusTool";

jest.mock("../ToolGovernancePolicy", () => ({
  canExecuteTool: jest.fn().mockResolvedValue({ allowed: true }),
  buildMutationTarget: jest.fn().mockReturnValue("mock:none")
}));

jest.mock("../ToolPersistentIdempotencyService", () => ({
  buildCorrelationId: jest.fn().mockReturnValue("corr-test"),
  buildToolIdempotencyKey: jest.fn().mockReturnValue("idem-test"),
  executeWithPersistentIdempotency: jest.fn(async ({ execute }) => ({
    result: await execute(),
    reused: false
  }))
}));

jest.mock("../../../../models/AiToolExecutionLog", () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) }
}));

jest.mock("../definitions/GetTicketStatusTool", () => ({
  GetTicketStatusTool: {
    definition: {
      id: "get_ticket_status",
      name: "get_ticket_status",
      description: "mock",
      parameters: {
        type: "object",
        properties: { includeHistory: { type: "boolean" } },
        required: []
      },
      riskLevel: "read",
      enabled: true,
      allowedOverrideParams: []
    },
    execute: jest.fn().mockResolvedValue({
      success: true,
      output: '{"status":"open"}'
    })
  }
}));

describe("ToolExecutor prompt injection guards", () => {
  it("strips immutable server context params from tool input", async () => {
    const result = await executeToolCall({
      tool: GetTicketStatusTool,
      toolCallId: "call-1",
      args: {
        includeHistory: true,
        companyId: 999,
        ticketId: 888,
        queueId: 777,
        extraParam: "DROP TABLE"
      },
      context: {
        companyId: 1,
        aiAgentId: 1,
        ticketId: 10,
        contactId: 20
      },
      iteration: 1
    });

    expect(result.success).toBe(true);
    expect(result.wrappedOutput).toContain("[OPERATIONAL_DATA]");
  });
});
