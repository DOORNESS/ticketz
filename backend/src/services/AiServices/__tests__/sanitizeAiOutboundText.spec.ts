import {
  containsProactiveHandoffLanguage,
  containsInternalKnowledgeLeak,
  sanitizeAiOutboundText
} from "../sanitizeAiOutboundText";

describe("sanitizeAiOutboundText", () => {
  it("removes proactive human handoff sentences", () => {
    const input =
      "Verifique sua senha. Se precisar de mais ajuda, aguarde o atendimento humano, disponível de segunda a sexta.";
    const output = sanitizeAiOutboundText(input);
    expect(output).toContain("Verifique sua senha");
    expect(output).not.toMatch(/atendimento humano/i);
  });

  it("keeps text without handoff language", () => {
    const input = "Tente redefinir a senha pelo link Esqueci minha senha.";
    expect(sanitizeAiOutboundText(input)).toBe(input);
  });

  it("detects proactive handoff patterns", () => {
    expect(
      containsProactiveHandoffLanguage(
        "Você pode aguardar o atendimento humano amanhã."
      )
    ).toBe(true);
  });

  it("blocks internal knowledge leaks from reaching customers", () => {
    const input =
      "Com base no nosso material: detalhes.\n# O que o robô nunca deve fazer\nNunca orientar o cliente a criar outra conta.";
    expect(containsInternalKnowledgeLeak(input)).toBe(true);
    expect(sanitizeAiOutboundText(input)).toBe("");
  });
});
