import { resolveCustomerFirstName } from "../resolveCustomerFirstName";
import { buildAgentGreetingReply } from "../AgentPersonaService";
import { buildTimeBasedGreeting } from "../Triage/CaseCompletenessEngine";
import {
  resolveSeededBasePrompt,
  NIVEL_PROMPT,
  FORTMAX_PROMPT
} from "../WireSupportLinesService";

describe("resolveCustomerFirstName", () => {
  it("usa o primeiro nome do pushName do WhatsApp", () => {
    expect(
      resolveCustomerFirstName({ name: "Fernando Tarin", number: "5517999" })
    ).toBe("Fernando");
  });

  it("ignora o nome quando o contato só tem o próprio número", () => {
    expect(
      resolveCustomerFirstName({
        name: "5517991658811",
        number: "5517991658811"
      })
    ).toBeNull();
    expect(
      resolveCustomerFirstName({
        name: "+55 17 99165-8811",
        number: "5517991658811"
      })
    ).toBeNull();
  });

  it("descarta contato sem nome utilizável", () => {
    expect(resolveCustomerFirstName({ name: "", number: "551799" })).toBeNull();
    expect(
      resolveCustomerFirstName({ name: "😴", number: "551799" })
    ).toBeNull();
    expect(resolveCustomerFirstName(null)).toBeNull();
  });

  it("normaliza caixa alta e remove emoji colado no nome", () => {
    expect(resolveCustomerFirstName({ name: "MARCIO 😎" })).toBe("Marcio");
    expect(resolveCustomerFirstName({ name: "ana paula" })).toBe("Ana");
  });
});

describe("buildTimeBasedGreeting", () => {
  it("inclui o nome do cliente quando houver", () => {
    expect(buildTimeBasedGreeting("America/Sao_Paulo", "Fernando")).toMatch(
      /^Olá, Fernando, (bom dia|boa tarde|boa noite)!$/
    );
  });

  it("omite o nome quando não houver", () => {
    expect(buildTimeBasedGreeting("America/Sao_Paulo")).toMatch(
      /^Olá, (bom dia|boa tarde|boa noite)!$/
    );
  });
});

describe("buildAgentGreetingReply", () => {
  const agent = {
    name: "Nivelton",
    basePrompt:
      'Você é o Nivelton. Quando perguntarem seu nome, responda: "Me chamo Nivelton, assistente da Nível Cashback."'
  };

  it("abre simples, sem apresentar o assistente", () => {
    const reply = buildAgentGreetingReply({
      agent,
      alreadyGreeted: false,
      customerName: "Fernando"
    });

    expect(reply).toMatch(
      /^Olá, Fernando, (bom dia|boa tarde|boa noite)! Em que posso ajudar\?$/
    );
    expect(reply).not.toContain("Me chamo");
    expect(reply).not.toContain("Nivelton");
    expect(reply).not.toContain("Como posso ajudar você hoje");
  });

  it("sem nome do cliente, cumprimenta apenas pelo período", () => {
    const reply = buildAgentGreetingReply({ agent, alreadyGreeted: false });
    expect(reply).toMatch(
      /^Olá, (bom dia|boa tarde|boa noite)! Em que posso ajudar\?$/
    );
  });

  it("não repete a saudação se já cumprimentou no ticket", () => {
    expect(
      buildAgentGreetingReply({
        agent,
        alreadyGreeted: true,
        customerName: "Fernando"
      })
    ).toBe("Em que posso ajudar?");
  });
});

describe("resolveSeededBasePrompt", () => {
  const nivelArgs = {
    seedPrompt: NIVEL_PROMPT,
    foreignBrandMarkers: ["webin", "fortmax", "webg3", "fortcontrol"]
  };

  it("preserva o prompt editado pelo admin entre reinícios", () => {
    const custom =
      "Você é o Nivelton. Seja direto e nunca se apresente sem ser perguntado.";
    expect(
      resolveSeededBasePrompt({ ...nivelArgs, currentPrompt: custom })
    ).toBe(custom);
  });

  it("resemeia quando o prompt está vazio", () => {
    expect(
      resolveSeededBasePrompt({ ...nivelArgs, currentPrompt: "   " })
    ).toBe(NIVEL_PROMPT);
    expect(resolveSeededBasePrompt({ ...nivelArgs, currentPrompt: null })).toBe(
      NIVEL_PROMPT
    );
  });

  it("resemeia quando o prompt é da outra marca", () => {
    expect(
      resolveSeededBasePrompt({
        ...nivelArgs,
        currentPrompt: "Você é o Webin, assistente virtual da Fortmax Sistemas."
      })
    ).toBe(NIVEL_PROMPT);
  });

  it("aplica a mesma regra na linha Fortmax", () => {
    const custom = "Você é o Webin. Responda curto.";
    expect(
      resolveSeededBasePrompt({
        currentPrompt: custom,
        seedPrompt: FORTMAX_PROMPT,
        foreignBrandMarkers: ["nivelton", "nível cashback", "nivel cashback"]
      })
    ).toBe(custom);

    expect(
      resolveSeededBasePrompt({
        currentPrompt: "Você é o Nivelton, assistente da Nível Cashback.",
        seedPrompt: FORTMAX_PROMPT,
        foreignBrandMarkers: ["nivelton", "nível cashback", "nivel cashback"]
      })
    ).toBe(FORTMAX_PROMPT);
  });
});
