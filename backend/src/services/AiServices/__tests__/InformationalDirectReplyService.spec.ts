import { tryInformationalDirectReply } from "../InformationalDirectReplyService";
import { isInformationalIntent } from "../Triage/CaseCompletenessEngine";

jest.mock("../AiHelpers", () => ({
  getKnowledgeBaseIdsForAgent: jest.fn(async () => [10, 11])
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
        body: "como funciona o nivel cashback?"
      }
    ])
  }
}));

describe("InformationalDirectReplyService", () => {
  const agent = {
    id: 7,
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

  it("routes cashback/nivel FAQ questions as informational intent", () => {
    expect(isInformationalIntent("como funciona o nivel cashback?")).toBe(true);
    expect(isInformationalIntent("o que é o nível?")).toBe(true);
    expect(isInformationalIntent("Pode me explicar sobre o nível?")).toBe(true);
    expect(isInformationalIntent("oi")).toBe(false);
  });

  it("returns a knowledge-based reply without needing tools/triage", async () => {
    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "como funciona o nivel cashback?"
    });

    expect(result.replied).toBe(true);
    expect(result.reason).toBe("informational_direct_knowledge_path");
    expect(result.knowledgeBaseIds).toEqual([10, 11]);
    expect(result.chunkCount).toBe(1);
    expect(result.body).toMatch(/Nível Cashback/i);
    expect(result.body!.length).toBeGreaterThanOrEqual(20);
  });

  it("returns empty_reply when model produces almost nothing", async () => {
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
      userText: "como funciona?"
    });

    expect(result.replied).toBe(false);
    expect(result.reason).toBe("empty_reply");
  });

  it("returns provider_error when completion throws", async () => {
    const { chatCompletion } = jest.requireMock("../ModelGateway");
    chatCompletion.mockRejectedValueOnce(new Error("timeout"));

    const result = await tryInformationalDirectReply({
      companyId: 1,
      ticket,
      agent,
      userText: "como funciona o cashback?"
    });

    expect(result.replied).toBe(false);
    expect(result.reason).toBe("provider_error");
  });
});
