const mockDestroy = jest.fn().mockResolvedValue(0);
const mockFindAll = jest.fn().mockResolvedValue([]);

jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: {
    findAll: (...args: unknown[]) => mockFindAll(...args),
    destroy: (...args: unknown[]) => mockDestroy(...args)
  }
}));

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { destroy: (...args: unknown[]) => mockDestroy(...args) }
}));

jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: {
    findAll: (...args: unknown[]) => mockFindAll(...args),
    destroy: (...args: unknown[]) => mockDestroy(...args)
  }
}));

jest.mock("../../../models/AiConversationLog", () => ({
  __esModule: true,
  default: { destroy: (...args: unknown[]) => mockDestroy(...args) }
}));

const passthroughModel = {
  destroy: (...args: unknown[]) => mockDestroy(...args)
};

[
  "OldMessage",
  "TicketTraking",
  "TicketTag",
  "TicketNote",
  "UserRating",
  "AiReplayLog",
  "MessageMediaFile",
  "MediaDeletionAudit",
  "ContactCustomField",
  "ContactTag",
  "Schedule",
  "WhatsappLidMap",
  "ContactAiMemory",
  "ContactAiMemoryJob",
  "ContactAiMemoryLog",
  "AiToolExecutionLog",
  "AiToolIdempotencyRecord",
  "AiTicketTimelineEvent",
  "AiKnowledgeSuggestion",
  "AiCopilotSuggestion",
  "AiRoutingLog",
  "ContentRepositoryUsageLog"
].forEach(modelName => {
  jest.mock(`../../../models/${modelName}`, () => ({
    __esModule: true,
    default: passthroughModel
  }));
});

jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    transaction: jest.fn(),
    query: jest.fn().mockResolvedValue([])
  }
}));

jest.mock("../AiInboundQueueService", () => ({
  getAiInboundQueue: () => ({
    client: {
      scanStream: () => ({
        on: (event: string, handler: () => void) => {
          if (event === "end") {
            handler();
          }
          return { on: jest.fn() };
        }
      }),
      del: jest.fn()
    }
  })
}));

import sequelize from "../../../database";
import { resetTestEnvironmentForCompany } from "../ResetTestEnvironmentService";

describe("ResetTestEnvironmentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroy.mockResolvedValue(0);
    mockFindAll.mockResolvedValue([]);
  });

  it("runs wipe inside a transaction and deletes company tickets/messages/contacts", async () => {
    const transaction = { id: "tx" };

    (sequelize.transaction as jest.Mock).mockImplementation(async fn =>
      fn(transaction)
    );

    mockFindAll
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ id: 20 }]);

    const summary = await resetTestEnvironmentForCompany(1, {
      wipeContacts: true
    });

    expect(sequelize.transaction).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
    expect(summary.companyId).toBe(1);
    expect(summary.contactsDeleted).toBeGreaterThanOrEqual(0);
    expect(summary.ticketsDeleted).toBeGreaterThanOrEqual(0);
  });
});
