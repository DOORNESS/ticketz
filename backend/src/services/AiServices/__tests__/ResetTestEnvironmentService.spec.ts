const mockDestroy = jest.fn().mockResolvedValue(0);
const mockCount = jest.fn().mockResolvedValue(0);
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
  default: {
    count: (...args: unknown[]) => mockCount(...args),
    destroy: (...args: unknown[]) => mockDestroy(...args)
  }
}));

jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: {
    count: (...args: unknown[]) => mockCount(...args),
    destroy: (...args: unknown[]) => mockDestroy(...args)
  }
}));

jest.mock("../../../models/AiConversationLog", () => ({
  __esModule: true,
  default: {
    count: (...args: unknown[]) => mockCount(...args),
    destroy: (...args: unknown[]) => mockDestroy(...args)
  }
}));

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
    mockCount.mockResolvedValue(0);
    mockFindAll.mockResolvedValue([]);
  });

  it("runs wipe inside a transaction and deletes company tickets/messages/contacts", async () => {
    const transaction = { id: "tx" };

    (sequelize.transaction as jest.Mock).mockImplementation(async fn =>
      fn(transaction)
    );

    mockCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    mockDestroy.mockResolvedValueOnce(4);

    const summary = await resetTestEnvironmentForCompany(1, {
      wipeContacts: true
    });

    expect(sequelize.transaction).toHaveBeenCalled();
    expect(sequelize.query).toHaveBeenCalled();
    expect(summary.companyId).toBe(1);
    expect(summary.contactsDeleted).toBe(3);
    expect(summary.ticketsDeleted).toBe(4);
    expect(summary.messagesDeleted).toBe(5);
    expect(summary.aiLogsDeleted).toBe(2);
  });
});
