import { prepareCustomerFacingAiText } from "../prepareCustomerFacingAiText";
import { sanitizeAiOutboundText } from "../sanitizeAiOutboundText";

describe("prepareCustomerFacingAiText", () => {
  it("removes support phone from normal product answers", () => {
    const input =
      "A Nível Cashback fideliza clientes.\nWhatsApp do suporte: (17) 99165-8811";
    const output = prepareCustomerFacingAiText(
      input,
      "como funciona a nivel cashback?"
    );

    expect(output).toMatch(/Nível Cashback/i);
    expect(output).not.toMatch(/99165/);
  });

  it("does not replace the official recovery flow with a phone number", () => {
    const output = prepareCustomerFacingAiText(
      "Entendi, vou te orientar.",
      "preciso resetar minha senha",
      {
        name: "Nivelton",
        basePrompt: "Você é o Nivelton, assistente da Nível Cashback."
      }
    );

    expect(output).not.toMatch(/99165/);
  });

  it("normalizes duplicated markdown links", () => {
    const output = prepareCustomerFacingAiText(
      "O site é [Nível Cashback](https://nivelvelo.com) (https://nivelvelo.com).",
      "esqueci minha senha"
    );

    expect(output).toBe("O site é https://nivelvelo.com.");
  });

  it("does not inject the Nível support phone into Fortmax replies", () => {
    const output = prepareCustomerFacingAiText(
      "Vou orientar a recuperação.",
      "preciso resetar minha senha",
      {
        name: "Webin",
        basePrompt: "Você é o Webin, assistente virtual da Fortmax."
      }
    );

    expect(output).not.toMatch(/99165/);
  });

  it("preserves official Fortmax contacts for the Fortmax agent", () => {
    const output = prepareCustomerFacingAiText(
      "Para financeiro, fale com a Cristiane no WhatsApp 17 99605-8041.",
      "preciso atualizar meu boleto",
      {
        name: "Atendente Fortmax",
        basePrompt: "Você é o assistente virtual da Fortmax."
      }
    );

    expect(output).toMatch(/Cristiane.*99605-8041/i);
  });

  it("gives Nível a concrete support route when an offered procedure is unavailable", () => {
    const output = prepareCustomerFacingAiText(
      "Desculpe, mas não tenho um link específico para agendar a demonstração.",
      "então quero agendar a demonstração",
      {
        name: "Nivelton",
        basePrompt: "Você é o Nivelton, assistente da Nível Cashback."
      }
    );

    expect(output).toMatch(/nivelvelo\.com\/chamado/i);
  });

  it("replaces an unsupported Fortmax portal with the correct human channel", () => {
    const output = prepareCustomerFacingAiText(
      "Você pode acessar o portal de clientes da Fortmax para atualizar o boleto.",
      "quero atualizar meu boleto",
      {
        name: "Atendente Fortmax",
        basePrompt: "Você é o assistente virtual da Fortmax."
      }
    );

    expect(output).toMatch(/Cristiane.*99605-8041/i);
    expect(output).not.toMatch(/portal de clientes/i);
  });

  it("removes false image blindness when vision context exists", () => {
    const output = prepareCustomerFacingAiText(
      "Infelizmente, não consigo ver imagens. Pelo que você descreveu, o login retornou e-mail ou senha incorretos.",
      "veja o erro\n\n[Imagem enviada pelo cliente]: Mensagem em vermelho: e-mail ou senha incorretos.",
      {
        name: "Webin",
        basePrompt: "Você é o Webin, assistente virtual da Fortmax."
      }
    );

    expect(output).not.toMatch(/n[aã]o consigo ver imagens/i);
    expect(output).toMatch(/e-mail ou senha incorretos/i);
  });

  it("removes false image blindness when customer asks if bot can see the image", () => {
    const output = prepareCustomerFacingAiText(
      "Desculpe, mas não consigo ver imagens. Vamos resolver seu problema de login juntos.",
      "veja o erro que estou tendo com o meu login, consegue ver a imagem ?",
      {
        name: "Webin",
        basePrompt: "Você é o Webin, assistente virtual da Fortmax."
      }
    );

    expect(output).not.toMatch(/n[aã]o consigo ver imagens/i);
  });
});

describe("sanitizeAiOutboundText phone stripping", () => {
  it("strips phone unless explicitly allowed", () => {
    const input = "Fale no (17) 99165-8811";
    expect(sanitizeAiOutboundText(input)).not.toMatch(/99165/);
    expect(sanitizeAiOutboundText(input, { allowSupportPhone: true })).toMatch(
      /99165/
    );
  });
});
