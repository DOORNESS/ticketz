import {
  buildAgentGreetingReply,
  buildAgentIdentityReply,
  buildAgentOperationalRules,
  detectAgentBrand,
  resolveAgentExternalSupportReply,
  resolveAgentInformationalFallback,
  resolveSupportPhoneForAgent
} from "../AgentPersonaService";

describe("Agent brand isolation", () => {
  const nivel = {
    name: "Nivelton",
    basePrompt:
      'Você é o Nivelton, assistente da Nível Cashback. Responda: "Me chamo Nivelton, assistente da Nível Cashback."'
  };
  const fortmax = {
    name: "Webin",
    basePrompt:
      'Você é o Webin, assistente virtual da Fortmax. Responda: "Me chamo Webin, Assistente Virtual da Fortmax."'
  };

  it("builds the identity reply from the active agent", () => {
    expect(buildAgentIdentityReply(nivel)).toMatch(/Nivelton.*Nível Cashback/i);
    expect(buildAgentIdentityReply(fortmax)).toMatch(/Webin.*Fortmax/i);
  });

  it("keeps the opening greeting neutral, without naming the assistant", () => {
    // A identidade só aparece quando o cliente pergunta; por isso a saudação
    // não pode citar marca nem nome do agente.
    const greetings = [nivel, fortmax].map(agent =>
      buildAgentGreetingReply({ agent, alreadyGreeted: false })
    );

    greetings.forEach(greeting => {
      expect(greeting).toMatch(
        /^Olá, (bom dia|boa tarde|boa noite)! Em que posso ajudar\?$/
      );
      expect(greeting).not.toMatch(/Nivelton|Webin|Fortmax|Nível Cashback/i);
    });
  });

  it("never derives the brand from customer text", () => {
    expect(detectAgentBrand(fortmax)).toBe("fortmax");
    expect(resolveAgentInformationalFallback(fortmax)).toMatch(/Thiago/i);
    expect(resolveAgentInformationalFallback(fortmax)).not.toMatch(
      /Nivelton|Nível Cashback/i
    );
  });

  it("keeps operational rules brand-specific and uses official recovery flows", () => {
    expect(buildAgentOperationalRules(nivel)).toMatch(/Nível Cashback/i);
    expect(buildAgentOperationalRules(nivel)).toMatch(/links oficiais/i);
    expect(buildAgentOperationalRules(nivel)).not.toMatch(/99165/i);
    expect(buildAgentOperationalRules(fortmax)).toMatch(/Fortmax/i);
    expect(buildAgentOperationalRules(fortmax)).toMatch(/98833|99605/i);
    expect(buildAgentOperationalRules(fortmax)).not.toMatch(/99165|Nivelton/i);
    expect(resolveSupportPhoneForAgent(nivel)).toBeNull();
    expect(resolveSupportPhoneForAgent(fortmax)).toBeNull();
  });

  it("uses each brand external support protocol", () => {
    expect(resolveAgentExternalSupportReply(nivel)).toMatch(
      /nivelvelo\.com\/chamado/i
    );
    expect(resolveAgentExternalSupportReply(nivel)).not.toMatch(
      /transfer|99165/i
    );
    expect(
      resolveAgentExternalSupportReply(fortmax, "segunda via boleto")
    ).toMatch(/Cristiane.*99605/i);
  });
});
