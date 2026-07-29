import {
  buildIntelligentQueueMenu,
  resolveIntelligentQueueSelection
} from "../AiQueueConciergeService";
import { chatCompletion } from "../ModelGateway";

const mockAgentQueueFindAll = jest.fn();

jest.mock("../../../models/AiAgentQueue", () => ({
  __esModule: true,
  default: {
    findAll: (...args: unknown[]) => mockAgentQueueFindAll(...args)
  }
}));

jest.mock("../ModelGateway", () => ({
  chatCompletion: jest.fn()
}));

const mockedChatCompletion = chatCompletion as jest.MockedFunction<
  typeof chatCompletion
>;

const queues = [
  { id: 1, name: "Financeiro Fortmax", greetingMessage: "Setor financeiro" },
  { id: 3, name: "Gerência Fortmax", greetingMessage: "Gerência" },
  { id: 2, name: "Suporte Fortmax", greetingMessage: "Suporte técnico" }
] as never;

describe("AiQueueConciergeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentQueueFindAll.mockResolvedValue([
      {
        aiAgent: {
          id: 10,
          name: "Webin",
          active: true,
          role: "legacy",
          textModel: "gpt-4o-mini",
          provider: "openai"
        }
      }
    ]);
  });

  it("builds an AI introduction with only the connected queues", async () => {
    mockedChatCompletion.mockResolvedValue({
      content:
        "Olá! Eu sou o Webin, assistente virtual da Fortmax. Vou ajudar a direcionar seu atendimento.",
      tokensInput: 10,
      tokensOutput: 20,
      model: "gpt-4o-mini"
    });

    const menu = await buildIntelligentQueueMenu({ companyId: 1, queues });

    expect(menu).toContain("Eu sou o Webin");
    expect(menu).toContain("1 - Financeiro Fortmax");
    expect(menu).toContain("2 - Gerência Fortmax");
    expect(menu).toContain("3 - Suporte Fortmax");
    expect(menu).not.toContain("Programação");
    expect(menu).toContain("número ou explicar brevemente");
  });

  it("resolves a numeric choice deterministically", async () => {
    const selection = await resolveIntelligentQueueSelection({
      companyId: 1,
      customerText: "2",
      queues
    });

    expect(selection).toEqual({
      queueId: 3,
      method: "number",
      confidence: 1
    });
    expect(mockedChatCompletion).not.toHaveBeenCalled();
  });

  it("understands an obvious financial request without an LLM call", async () => {
    const selection = await resolveIntelligentQueueSelection({
      companyId: 1,
      customerText: "Preciso da segunda via do boleto",
      queues
    });

    expect(selection?.queueId).toBe(1);
    expect(selection?.method).toBe("keyword");
    expect(mockedChatCompletion).not.toHaveBeenCalled();
  });

  it("uses the LLM for natural language that keywords cannot resolve", async () => {
    mockedChatCompletion.mockResolvedValue({
      content: '{"queueId":2,"confidence":0.82}',
      tokensInput: 20,
      tokensOutput: 10,
      model: "gpt-4o-mini"
    });

    const selection = await resolveIntelligentQueueSelection({
      companyId: 1,
      customerText: "A tela fica branca depois que eu confirmo",
      queues
    });

    expect(selection).toEqual({
      queueId: 2,
      method: "llm",
      confidence: 0.82
    });
  });

  it("rejects a queue id that is not connected to this WhatsApp", async () => {
    mockedChatCompletion.mockResolvedValue({
      content: '{"queueId":999,"confidence":0.99}',
      tokensInput: 20,
      tokensOutput: 10,
      model: "gpt-4o-mini"
    });

    const selection = await resolveIntelligentQueueSelection({
      companyId: 1,
      customerText: "Quero outro departamento",
      queues
    });

    expect(selection).toBeNull();
  });
});
