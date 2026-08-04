import {
  findUnansweredCustomerQuestion,
  resolveCustomerTurnText
} from "../WhatsAppCustomerTurnResolver";

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn()
  }
}));
jest.mock("../sendAiWhatsAppReply", () => ({
  deliverAiReply: jest.fn(async () => true)
}));
jest.mock("../InformationalDirectReplyService", () => ({
  tryInformationalDirectReply: jest.fn()
}));
jest.mock("../prepareCustomerFacingAiText", () => ({
  prepareCustomerFacingAiText: jest.fn((text: string) => text)
}));
jest.mock("../AiDecisionLogger", () => ({
  persistAiDecisionLog: jest.fn(async () => undefined)
}));
jest.mock("../Triage/TriageOrchestratorService", () => ({
  finalizeAiResponse: jest.fn(async () => undefined)
}));
jest.mock("../../TicketServices/UpdateTicketService", () => ({
  websocketUpdateTicket: jest.fn()
}));

import Message from "../../../models/Message";
import type AiAgent from "../../../models/AiAgent";
import { buildFastGreetingReply } from "../WhatsAppAiTurnService";

const mockFindAll = Message.findAll as jest.Mock;
const mockFindOne = Message.findOne as jest.Mock;

describe("WhatsAppAiTurnService", () => {
  beforeEach(() => {
    mockFindAll.mockReset();
    mockFindOne.mockReset();
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

  it("treats batched greeting plus help request as a single social turn", async () => {
    mockFindAll.mockResolvedValueOnce([]);

    const resolved = await resolveCustomerTurnText({
      ticketId: 42,
      rawUserText: "oi\n\npoderia me ajudar ?",
      messageParts: ["oi", "poderia me ajudar ?"]
    });

    expect(resolved).toBe("oi");
  });

  it("keeps image vision context when caption is selected as primary turn", async () => {
    mockFindAll.mockResolvedValueOnce([]);

    const resolved = await resolveCustomerTurnText({
      ticketId: 42,
      rawUserText:
        "veja o erro que estou tendo com o meu login, consegue ver a imagem ?\n\n[Imagem enviada pelo cliente]: Mensagem em vermelho: E-mail ou senha incorretos.",
      messageParts: [
        "veja o erro que estou tendo com o meu login, consegue ver a imagem ?",
        "[Imagem enviada pelo cliente]: Mensagem em vermelho: E-mail ou senha incorretos."
      ]
    });

    expect(resolved).toContain("consegue ver a imagem");
    expect(resolved).toContain("E-mail ou senha incorretos");
  });

  it("replays last real question on cadê vc", async () => {
    mockFindAll.mockResolvedValueOnce([
      {
        fromMe: false,
        body: "Queria saber como o nível pode ser útil para minha empresa?"
      },
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
      rawUserText:
        "Oi\n\nQueria saber como o nível pode ser útil para minha empresa?",
      messageParts: [
        "Oi",
        "Queria saber como o nível pode ser útil para minha empresa?"
      ]
    });

    expect(resolved).toContain("útil para minha empresa");
  });

  it("greets by the customer first name, without naming the assistant", async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const agent = {
      name: "Nivelton",
      basePrompt:
        'Você é o Nivelton. Responda: "Me chamo Nivelton, assistente da Nível Cashback."'
    } as AiAgent;

    const reply = await buildFastGreetingReply(42, agent, {
      name: "Fernando Tarin",
      number: "5517991658811"
    });

    expect(reply).toMatch(
      /^Olá, Fernando, (bom dia|boa tarde|boa noite)! Em que posso ajudar\?$/
    );
    expect(reply).not.toMatch(/Nivelton|Nível Cashback|Fortmax|Webin/i);
  });

  it("omits the name when the contact has no usable pushName", async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const agent = {
      name: "Webin",
      basePrompt:
        'Você é o Webin, assistente virtual da Fortmax. Responda: "Me chamo Webin, Assistente Virtual da Fortmax."'
    } as AiAgent;

    const reply = await buildFastGreetingReply(42, agent, {
      name: "5517991658811",
      number: "5517991658811"
    });

    expect(reply).toMatch(
      /^Olá, (bom dia|boa tarde|boa noite)! Em que posso ajudar\?$/
    );
    expect(reply).not.toMatch(/Nivelton|Nível Cashback|Fortmax|Webin/i);
  });
});
