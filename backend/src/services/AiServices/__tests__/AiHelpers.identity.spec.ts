import {
  buildAgentIdentityReply,
  detectAgentIdentityQuestion,
  rankQueuesForAutomaticAiRouting
} from "../AiHelpers";

describe("AiHelpers identity", () => {
  it("detects direct name questions", () => {
    expect(detectAgentIdentityQuestion("Qual seu nome")).toBe(true);
    expect(detectAgentIdentityQuestion("Como você se chama?")).toBe(true);
  });

  it("detects naming suggestions for Webin", () => {
    expect(
      detectAgentIdentityQuestion("Vc precisa ter um nome. Será Webin")
    ).toBe(true);
  });

  it("does not treat product FAQ as identity question", () => {
    expect(
      detectAgentIdentityQuestion(
        "quero saber mais do nivel, o que é este programa de fidelidade ?"
      )
    ).toBe(false);
    expect(detectAgentIdentityQuestion("qual o nome do produto")).toBe(false);
  });

  it("returns a neutral identity reply when no agent is provided", () => {
    expect(buildAgentIdentityReply()).toBe(
      "Sou o assistente virtual deste canal."
    );
  });

  it("returns identity from agent basePrompt", () => {
    expect(
      buildAgentIdentityReply({
        name: "Nivelton",
        basePrompt:
          'Você é o Nivelton. Quando perguntarem seu nome, responda: "Me chamo Nivelton, assistente da Nível Cashback."'
      })
    ).toBe("Me chamo Nivelton, assistente da Nível Cashback.");
  });

  it("routes Nível silently to consumer support by default", () => {
    const ranked = rankQueuesForAutomaticAiRouting([
      { id: 3, name: "03 - Recuperar Conta Nível" },
      { id: 2, name: "02 - Suporte Empresa Nível" },
      { id: 1, name: "01 - Suporte Consumidor Nível" }
    ]);

    expect(ranked.map(queue => queue.id)).toEqual([1, 2, 3]);
  });

  it("routes Fortmax silently to support by default", () => {
    const ranked = rankQueuesForAutomaticAiRouting([
      { id: 1, name: "Financeiro Fortmax" },
      { id: 2, name: "Gerência Fortmax" },
      { id: 3, name: "Suporte Fortmax" }
    ]);

    expect(ranked.map(queue => queue.id)).toEqual([3, 1, 2]);
  });
});
