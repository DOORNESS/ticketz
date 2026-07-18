import { UniqueConstraintError } from "sequelize";
import AiToolIdempotencyRecord from "../../../../models/AiToolIdempotencyRecord";
import {
  buildToolIdempotencyKey,
  executeWithPersistentIdempotency,
  findPersistedToolResult
} from "../ToolPersistentIdempotencyService";

jest.mock("../../../../models/AiToolIdempotencyRecord");
jest.mock("../../AiInboundQueueService", () => ({
  getAiInboundQueue: jest.fn(() => ({
    client: {
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1)
    }
  }))
}));

const mockedRecord = AiToolIdempotencyRecord as jest.Mocked<
  typeof AiToolIdempotencyRecord
>;

describe("ToolPersistentIdempotencyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRecord.findOne.mockResolvedValue(null);
    mockedRecord.create.mockResolvedValue({} as never);
  });

  it("builds deterministic idempotency keys", () => {
    const keyA = buildToolIdempotencyKey({
      toolId: "add_ticket_tag",
      ticketId: 1,
      contactId: 2,
      payload: { tagId: 10 }
    });
    const keyB = buildToolIdempotencyKey({
      toolId: "add_ticket_tag",
      ticketId: 1,
      contactId: 2,
      payload: { tagId: 10 }
    });
    const keyC = buildToolIdempotencyKey({
      toolId: "add_ticket_tag",
      ticketId: 1,
      contactId: 2,
      payload: { tagId: 11 }
    });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it("reuses persisted result on sequential identical calls", async () => {
    mockedRecord.findOne.mockResolvedValueOnce({
      resultSanitized: JSON.stringify({ success: true, output: '{"ok":true}' })
    } as never);

    const execute = jest.fn();

    const first = await executeWithPersistentIdempotency({
      companyId: 1,
      toolId: "add_ticket_tag",
      ticketId: 10,
      contactId: 20,
      aiAgentId: 3,
      idempotencyKey: "abc123",
      correlationId: "corr-1",
      execute
    });

    expect(first.reused).toBe(true);
    expect(first.result.success).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("handles unique constraint race by reusing existing row", async () => {
    mockedRecord.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        resultSanitized: JSON.stringify({
          success: true,
          output: '{"stored":true}'
        })
      } as never);

    const uniqueError = Object.create(
      UniqueConstraintError.prototype
    ) as UniqueConstraintError;
    uniqueError.message = "duplicate";
    mockedRecord.create.mockRejectedValueOnce(uniqueError);

    const execute = jest.fn().mockResolvedValue({
      success: true,
      output: '{"stored":true}'
    });

    const result = await executeWithPersistentIdempotency({
      companyId: 1,
      toolId: "update_ticket_priority",
      ticketId: 10,
      contactId: 20,
      aiAgentId: 3,
      idempotencyKey: "race-key",
      correlationId: "corr-race",
      execute
    });

    expect(result.reused).toBe(true);
    expect(result.result.output).toContain("stored");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("findPersistedToolResult returns null when row is missing", async () => {
    mockedRecord.findOne.mockReset();
    mockedRecord.findOne.mockResolvedValue(null);
    const value = await findPersistedToolResult(1, "missing");
    expect(value).toBeNull();
  });
});
