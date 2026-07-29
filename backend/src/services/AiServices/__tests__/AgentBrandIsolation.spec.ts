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

  it("builds identity and greeting from the active agent", () => {
    expect(buildAgentIdentityReply(nivel)).toMatch(/Nivelton.*Nível Cashback/i);
    expect(buildAgentIdentityReply(fortmax)).toMatch(/Webin.*Fortmax/i);

    const nivelGreeting = buildAgentGreetingReply({
      agent: nivel,
      alreadyGreeted: false
    });
    const fortmaxGreeting = buildAgentGreetingReply({
      agent: fortmax,
      alreadyGreeted: false
    });

    expect(nivelGreeting).toMatch(/Nivelton/i);
    expect(nivelGreeting).not.toMatch(/Fortmax/i);
    expect(fortmaxGreeting).toMatch(/Webin.*Fortmax/i);
    expect(fortmaxGreeting).not.toMatch(/Nivelton|Nível Cashback/i);
  });

  it("never derives the brand from customer text", () => {
    expect(detectAgentBrand(fortmax)).toBe("fortmax");
    expect(resolveAgentInformationalFallback(fortmax)).toMatch(/Webin/i);
    expect(resolveAgentInformationalFallback(fortmax)).not.toMatch(
      /Nivelton|Nível Cashback/i
    );
  });

  it("keeps operational rules brand-specific and uses official recovery flows", () => {
    expect(buildAgentOperationalRules(nivel)).toMatch(/Nível Cashback/i);
    expect(buildAgentOperationalRules(nivel)).toMatch(/links oficiais/i);
    expect(buildAgentOperationalRules(nivel)).not.toMatch(/99165/i);
    expect(buildAgentOperationalRules(fortmax)).toMatch(/Fortmax/i);
    expect(buildAgentOperationalRules(fortmax)).not.toMatch(/99165|Nivelton/i);
    expect(resolveSupportPhoneForAgent(nivel)).toBeNull();
    expect(resolveSupportPhoneForAgent(fortmax)).toBeNull();
  });

  it("uses the Nível external support protocol without affecting Fortmax", () => {
    expect(resolveAgentExternalSupportReply(nivel)).toMatch(
      /nivelvelo\.com\/chamado/i
    );
    expect(resolveAgentExternalSupportReply(nivel)).not.toMatch(
      /transfer|99165/i
    );
    expect(resolveAgentExternalSupportReply(fortmax)).toBeNull();
  });
});
