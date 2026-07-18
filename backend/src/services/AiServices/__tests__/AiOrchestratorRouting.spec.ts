import AiAgent from "../../../models/AiAgent";
import {
  detectTopicShift,
  runDeterministicRouting,
  sanitizeRoutingMessage,
  scoreSpecialtyKeywords
} from "../AiOrchestratorService";

const buildAgent = (
  partial: Partial<AiAgent> & Pick<AiAgent, "id" | "name" | "specialty">
): AiAgent =>
  ({
    priority: 100,
    routingKeywords: [],
    routingDescription: "",
    active: true,
    role: "specialist",
    ...partial
  }) as AiAgent;

const specialists = [
  buildAgent({
    id: 1,
    name: "FAQ",
    specialty: "faq",
    priority: 20,
    routingKeywords: ["horario", "telefone"]
  }),
  buildAgent({
    id: 2,
    name: "Financeiro",
    specialty: "financeiro",
    priority: 30,
    routingKeywords: ["pix", "boleto"]
  }),
  buildAgent({
    id: 3,
    name: "Suporte Técnico",
    specialty: "suporte",
    priority: 40,
    routingKeywords: ["erro", "login"]
  }),
  buildAgent({
    id: 4,
    name: "Atendimento Geral",
    specialty: "geral",
    priority: 100
  })
];

describe("AiOrchestratorService deterministic routing", () => {
  it("sanitizes sensitive data in routing logs", () => {
    const sanitized = sanitizeRoutingMessage(
      "Meu CPF 123.456.789-00 e key sk-test123456789"
    );
    expect(sanitized).toContain("[MASKED_CPF]");
    expect(sanitized).toContain("[MASKED_KEY]");
    expect(sanitized).not.toContain("123.456.789-00");
  });

  it("detects topic shift markers", () => {
    expect(detectTopicShift("Agora sobre outra coisa, preciso de ajuda")).toBe(
      true
    );
    expect(detectTopicShift("Quanto custa o plano?")).toBe(false);
  });

  const financeCases = [
    "como pago no pix?",
    "gerar boleto",
    "extrato da cobrança",
    "saldo da carteira",
    "pagamento não caiu"
  ];

  financeCases.forEach(message => {
    it(`routes financeiro: ${message}`, async () => {
      const result = await runDeterministicRouting(1, message, specialists);
      expect(result.agent.specialty).toBe("financeiro");
    });
  });

  const supportCases = [
    "site com erro 500",
    "nao consigo fazer login",
    "app travou",
    "cloudflare bloqueou",
    "bug no sistema"
  ];

  supportCases.forEach(message => {
    it(`routes suporte: ${message}`, async () => {
      const result = await runDeterministicRouting(1, message, specialists);
      expect(result.agent.specialty).toBe("suporte");
    });
  });

  const faqCases = [
    "qual horario de atendimento",
    "telefone de contato",
    "como funciona o suporte"
  ];

  faqCases.forEach(message => {
    it(`routes faq: ${message}`, async () => {
      const result = await runDeterministicRouting(1, message, specialists);
      expect(result.agent.specialty).toBe("faq");
    });
  });

  const generalCases = ["oi", "ola", "bom dia", "preciso de ajuda"];

  generalCases.forEach(message => {
    it(`routes geral for generic: ${message}`, async () => {
      const result = await runDeterministicRouting(1, message, specialists);
      expect(result.agent.specialty).toBe("geral");
    });
  });

  it("resolves PIX + erro conflict toward suporte when erro dominates", async () => {
    const scored = scoreSpecialtyKeywords(
      "deu erro ao pagar no pix e nao funciona",
      specialists
    );
    expect(scored[0].specialty).toBe("suporte");
  });

  it("routes ambiguous equal scores to geral", async () => {
    const balanced = specialists.map(agent =>
      buildAgent({
        ...agent,
        routingKeywords: ["consulta"]
      })
    );
    const result = await runDeterministicRouting(
      1,
      "consulta consulta consulta",
      balanced
    );
    expect(result.agent.specialty).toBe("geral");
  });

  it("returns geral when no keywords match", async () => {
    const result = await runDeterministicRouting(
      1,
      ".... .... ....",
      specialists
    );
    expect(result.agent.specialty).toBe("geral");
    expect(result.confidence).toBeLessThanOrEqual(0.4);
  });
});

describe("AiOrchestratorService extended scenarios", () => {
  const extraMessages: Array<{ message: string; expected: string }> = [
    { message: "preciso do extrato mensal", expected: "financeiro" },
    { message: "boleto vencido", expected: "financeiro" },
    { message: "transferencia bancaria", expected: "financeiro" },
    { message: "cashback nao creditou", expected: "financeiro" },
    { message: "fatura do mes passado", expected: "financeiro" },
    { message: "recebimento pendente", expected: "financeiro" },
    { message: "erro no android", expected: "suporte" },
    { message: "iphone nao abre", expected: "suporte" },
    { message: "turnstile invalido", expected: "suporte" },
    { message: "webview quebrado", expected: "suporte" },
    { message: "log de erro", expected: "suporte" },
    { message: "configurar integracao", expected: "suporte" },
    { message: "qual endereco", expected: "faq" },
    { message: "o que e fortmax", expected: "faq" },
    { message: "quem sao voces", expected: "faq" },
    { message: "bom dia", expected: "geral" },
    { message: "boa tarde", expected: "geral" },
    { message: "help", expected: "geral" },
    { message: "???", expected: "geral" },
    { message: "123", expected: "geral" }
  ];

  extraMessages.forEach(({ message, expected }) => {
    it(`extended routing: ${message}`, async () => {
      const result = await runDeterministicRouting(1, message, specialists);
      expect(result.agent.specialty).toBe(expected);
    });
  });
});
