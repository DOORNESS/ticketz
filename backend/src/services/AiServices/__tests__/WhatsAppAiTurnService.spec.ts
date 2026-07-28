import {
  findUnansweredCustomerQuestion,
  resolveCustomerTurnText
} from "../WhatsAppCustomerTurnResolver";

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn()
  }
}));

import Message from "../../../models/Message";

const mockFindAll = Message.findAll as jest.Mock;

describe("WhatsAppAiTurnService", () => {
  beforeEach(() => {
    mockFindAll.mockReset();
  });

  it("finds unanswered substantive customer question", async () => {
    mockFindAll.mockResolvedValue([
      {
        fromMe: false,
        body: "Queria saber como o nível pode ser útil para minha empresa?",
        createdAt: new Date("2026-07-26T18:13:00Z")
      },
      {
        fromMe: true,
        body: "Me chamo Nivelton, assistente da Nível Cashback. Como posso ajudar você hoje?",
        createdAt: new Date("2026-07-26T18:12:00Z")
      }
    ]);

    const unanswered = await findUnansweredCustomerQuestion(42);
    expect(unanswered).toContain("útil para minha empresa");
  });

  it("prioritizes unanswered question when customer sends Oi again", async () => {
    mockFindAll
      .mockResolvedValueOnce([
        {
          fromMe: false,
          body: "Queria saber como o nível pode ser útil para minha empresa?",
          createdAt: new Date("2026-07-26T18:13:00Z")
        },
        {
          fromMe: true,
          body: "Me chamo Nivelton, assistente da Nível Cashback. Como posso ajudar você hoje?",
          createdAt: new Date("2026-07-26T18:12:00Z")
        }
      ])
      .mockResolvedValueOnce([]);

    const resolved = await resolveCustomerTurnText({
      ticketId: 42,
      rawUserText: "Oi",
      messageParts: ["Oi"]
    });

    expect(resolved).toContain("útil para minha empresa");
  });

  it("replays last real question on cadê vc", async () => {
    mockFindAll.mockResolvedValueOnce([
      { fromMe: false, body: "Queria saber como o nível pode ser útil para minha empresa?" },
      { fromMe: false, body: "Oi" }
    ]);

    const resolved = await resolveCustomerTurnText({
      ticketId: 42,
      rawUserText: "Cadê vc",
      messageParts: ["Cadê vc"]
    });

    expect(resolved).toContain("útil para minha empresa");
  });

  it("prefers informational batch question over Oi in same payload", async () => {
    mockFindAll.mockResolvedValueOnce([]);

    const resolved = await resolveCustomerTurnText({
      ticketId: 42,
      rawUserText: "Oi\n\nQueria saber como o nível pode ser útil para minha empresa?",
      messageParts: [
        "Oi",
        "Queria saber como o nível pode ser útil para minha empresa?"
      ]
    });

    expect(resolved).toContain("útil para minha empresa");
  });
});
