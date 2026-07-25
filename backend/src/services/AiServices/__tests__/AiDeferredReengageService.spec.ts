const mockExists = jest.fn();
const mockDel = jest.fn();
const mockTryEngage = jest.fn();

jest.mock("../AiHelpers", () => ({
  canAiEngageTicket: jest.fn().mockReturnValue(true),
  isAiHandlingTicket: jest.fn().mockReturnValue(true)
}));

jest.mock("../AiInboundQueueService", () => ({
  getAiInboundQueue: () => ({
    client: {
      exists: mockExists,
      del: mockDel
    }
  })
}));

jest.mock("../AiReengagementService", () => ({
  tryEngageAiFromStoredMessage: (...args: unknown[]) => mockTryEngage(...args)
}));

jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn()
  }
}));

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn()
  }
}));

import Ticket from "../../../models/Ticket";
import Message from "../../../models/Message";
import { scheduleDeferredAiResponseCheck } from "../AiDeferredReengageService";

describe("AiDeferredReengageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExists.mockResolvedValue(1);
    mockDel.mockResolvedValue(1);
    mockTryEngage.mockResolvedValue(true);
  });

  it("re-enqueues when inbound has no outbound reply after delay", async () => {
    const ticket = {
      id: 23,
      companyId: 1,
      aiHandoff: false,
      aiPaused: false,
      userId: null,
      status: "pending",
      isGroup: false,
      contact: { disableBot: false },
      aiProcessingState: "processing",
      reload: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined)
    };

    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);
    (Message.findOne as jest.Mock)
      .mockResolvedValueOnce({
        id: "in-1",
        createdAt: new Date("2026-07-25T15:00:00Z"),
        body: "Pode ajudar?"
      })
      .mockResolvedValueOnce({
        id: "out-0",
        createdAt: new Date("2026-07-25T14:59:00Z")
      })
      .mockResolvedValueOnce({
        id: "in-1",
        body: "Pode ajudar?",
        mediaType: "text",
        getDataValue: () => undefined
      });

    scheduleDeferredAiResponseCheck({ companyId: 1, ticketId: 23, delayMs: 0 });

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockDel).toHaveBeenCalled();
    expect(mockTryEngage).toHaveBeenCalledWith(
      ticket,
      expect.objectContaining({ messageBody: "Pode ajudar?" }),
      "deferred_reengage"
    );
  });
});
