import { canExecuteTool } from "../ToolGovernancePolicy";
import { ToolExecutionContext, AiTool } from "../ToolRegistry";

jest.mock("../AiToolsFeatureFlag", () => ({
  isToolsEnabledForCompany: jest.fn().mockResolvedValue(true)
}));

jest.mock("../AiWriteToolsFeatureFlag", () => ({
  isWriteToolsEnabledForCompany: jest.fn().mockResolvedValue(false)
}));

jest.mock("../../../../models/AiAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue({ id: 1, companyId: 1 }) }
}));

jest.mock("../../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue({ id: 20, companyId: 1 }) }
}));

jest.mock("../../../../models/Ticket", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue({
      id: 10,
      companyId: 1,
      status: "open",
      userId: null
    })
  }
}));

describe("ToolGovernancePolicy", () => {
  const writeTool: AiTool = {
    definition: {
      id: "mock_write_tool",
      name: "mock_write_tool",
      description: "mock",
      parameters: { type: "object", properties: {} },
      riskLevel: "write",
      enabled: true,
      allowedOverrideParams: []
    },
    execute: async () => ({ success: true, output: "{}" })
  };

  const readTool: AiTool = {
    definition: {
      ...writeTool.definition,
      id: "mock_read_tool",
      riskLevel: "read"
    },
    execute: writeTool.execute
  };

  const baseContext: ToolExecutionContext = {
    companyId: 1,
    aiAgentId: 1,
    ticketId: 10,
    contactId: 20
  };

  it("blocks write tools when write flag is off", async () => {
    const decision = await canExecuteTool({
      companyId: 1,
      tool: writeTool,
      context: baseContext
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe("write_tools_disabled");
  });

  it("allows read tools when base tools are enabled", async () => {
    const decision = await canExecuteTool({
      companyId: 1,
      tool: readTool,
      context: baseContext
    });

    expect(decision.allowed).toBe(true);
  });

  it("blocks write tools when a human agent is assigned", async () => {
    const Ticket = (await import("../../../../models/Ticket")).default;
    (Ticket.findOne as jest.Mock).mockResolvedValueOnce({
      id: 10,
      companyId: 1,
      status: "open",
      userId: 99
    });

    const { isWriteToolsEnabledForCompany } =
      await import("../AiWriteToolsFeatureFlag");
    (isWriteToolsEnabledForCompany as jest.Mock).mockResolvedValueOnce(true);

    const decision = await canExecuteTool({
      companyId: 1,
      tool: writeTool,
      context: baseContext
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe("human_active");
  });

  it("blocks write tools when ticket is closed", async () => {
    const Ticket = (await import("../../../../models/Ticket")).default;
    (Ticket.findOne as jest.Mock).mockResolvedValueOnce({
      id: 10,
      companyId: 1,
      status: "closed",
      userId: null
    });

    const { isWriteToolsEnabledForCompany } =
      await import("../AiWriteToolsFeatureFlag");
    (isWriteToolsEnabledForCompany as jest.Mock).mockResolvedValueOnce(true);

    const decision = await canExecuteTool({
      companyId: 1,
      tool: writeTool,
      context: baseContext
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe("ticket_closed");
  });
});
