import { tryInformationalDirectReply } from "../InformationalDirectReplyService";
import {
  isInformationalIntent,
  isShortHelpRequest,
  isWaitingForBotNudge
} from "../Triage/CaseCompletenessEngine";

jest.mock("../AiHelpers", () => ({
  getKnowledgeBaseIdsForAgent: jest.fn(async () => [10, 11]),
  detectRequiresHumanAccountEscalation: jest.fn(() => false),
  NIVEL_SUPPORT_WHATSAPP_DISPLAY: "(17) 99165-8811"
}));

jest.mock("../KnowledgeContextService", () => ({
  buildKnowledgeContextForQuery: jest.fn(async () => ({
    contextBlock:
      "[Trecho 1]\nA Nível Cashback é um programa de fidelização com cashback em compras.",
    usedChunks: [{ id: 1, content: "cashback", similarity: 0.8 }],
    hasReadyDocuments: true,
    reingestedDocuments: 0
  }))
}));

jest.mock("../ModelGateway", () => ({
  chatCompletion: jest.fn(async () => ({
    content:
      "A Nível Cashback é um programa de fidelização: você acumula cashback nas compras e usa como desconto. Quer que eu explique os níveis?",
    tokensInput: 100,
    tokensOutput: 40,
    model: "gpt-4o-mini"
  }))
}));

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => [
      {
        fromMe: true,
        body: "Olá, boa tarde! Em que posso ajudar?"
      },
      {
        fromMe: false,
        body: "me fala o quie a nivel pode fazer pela minha empresa ?"
      }
    ])
  }
}));

describe("InformationalDirectReplyService", () => {
  const agent = {
    id: 7,
    name: "Nivelton",
    provider: "openai",
    textModel: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 4096,
    basePrompt: "Você é o Nivelton, assistente da Nível Cashback."
  } as Parameters<typeof tryInformationalDirectReply>[0]["agent"];

  const ticket = {
    id: 99,
    queueId: 3,
    companyId: 1
  } as Parameters<typeof tryInformationalDirectReply>[0]["ticket"];

  it("detects real customer FAQ phrasing from the failed WhatsApp chat", () => {
    expect(
      isInformationalIntent(
        "me fala o quie a nivel pode fazer pela minha empresa ?"
      )
    ).toBe(true);
    expect(isShortHelpRequest("pode me ajudar ?")).toBe(true);
    expect(isWaitingForBotNudge("cade vc")).toBe(true);
    expect(isWaitingForBotNudge("por que nao respode ?")).toBe(true);
    expect(isWaitingForBotNudge("vai me ajudar ou noa ?")).toBe(true);
  });

  it("returns a knowledge-based reply without needing tools/triage", async () => {
    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "me fala o quie a nivel pode fazer pela minha empresa ?"
    });

    expect(result.replied).toBe(true);
    expect(result.reason).toBe("informational_direct_knowledge_path");
    expect(result.body).toMatch(/Nível Cashback/i);
  });

  it("always replies with brand fallback when LLM fails", async () => {
    const { chatCompletion } = jest.requireMock("../ModelGateway");
    chatCompletion.mockRejectedValueOnce(new Error("timeout"));

    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "como funciona o cashback?"
    });

    expect(result.replied).toBe(true);
    expect(result.body).toBeTruthy();
    expect(result.body!.length).toBeGreaterThanOrEqual(20);
    expect(result.reason).toBe("informational_brand_fallback");
    expect(result.body).toMatch(/Nível Cashback/i);
    expect(result.body).not.toMatch(/rob[oô]/i);
  });

  it("never leaks internal agent instructions to the customer", async () => {
    const { buildKnowledgeContextForQuery } = jest.requireMock(
      "../KnowledgeContextService"
    );
    const { chatCompletion } = jest.requireMock("../ModelGateway");

    buildKnowledgeContextForQuery.mockResolvedValueOnce({
      contextBlock:
        "[Trecho 1]\n# O que o robô nunca deve fazer\nNunca orientar o cliente a criar outra conta.",
      usedChunks: [{ id: 1, content: "internal", similarity: 0.8 }],
      hasReadyDocuments: true,
      reingestedDocuments: 0
    });
    chatCompletion.mockRejectedValueOnce(new Error("timeout"));

    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "Pode falar sobre o nível pra mim?"
    });

    expect(result.replied).toBe(true);
    expect(result.reason).toBe("informational_brand_fallback");
    expect(result.body).not.toMatch(/rob[oô]/i);
    expect(result.body).not.toMatch(/nunca orientar/i);
  });

  it("uses brand fallback instead of leaking internal placeholder text", async () => {
    const { buildKnowledgeContextForQuery } = jest.requireMock(
      "../KnowledgeContextService"
    );
    buildKnowledgeContextForQuery.mockResolvedValueOnce({
      contextBlock: "",
      usedChunks: [],
      hasReadyDocuments: false,
      reingestedDocuments: 0
    });

    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "Sabe o que é nível cashback?"
    });

    expect(result.replied).toBe(true);
    expect(result.reason).toBe("informational_brand_fallback");
    expect(result.body).toMatch(/Nível Cashback/i);
    expect(result.body).not.toMatch(/base deste canal ainda está limitada/i);
  });

  it("always replies even when model returns almost nothing", async () => {
    const { chatCompletion } = jest.requireMock("../ModelGateway");
    chatCompletion.mockResolvedValueOnce({
      content: "ok",
      tokensInput: 1,
      tokensOutput: 1,
      model: "gpt-4o-mini"
    });

    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "o que a nivel faz?"
    });

    expect(result.replied).toBe(true);
    expect(result.body!.length).toBeGreaterThanOrEqual(20);
  });
});
