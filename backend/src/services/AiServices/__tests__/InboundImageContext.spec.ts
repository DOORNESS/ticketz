import {
  extractInboundImageContextParts,
  mergeInboundImageContextParts
} from "../InboundImageContext";

describe("InboundImageContext", () => {
  it("merges caption with image analysis block", () => {
    const parts = [
      "veja o erro que estou tendo com o meu login, consegue ver a imagem ?",
      "[Imagem enviada pelo cliente]: Mensagem em vermelho: E-mail ou senha incorretos."
    ];

    expect(extractInboundImageContextParts(parts)).toHaveLength(1);
    expect(
      mergeInboundImageContextParts(
        "veja o erro que estou tendo com o meu login, consegue ver a imagem ?",
        parts
      )
    ).toContain("E-mail ou senha incorretos");
  });
});
