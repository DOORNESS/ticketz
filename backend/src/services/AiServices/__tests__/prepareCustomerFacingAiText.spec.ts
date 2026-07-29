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
      "Acesse [https://nivelevelo.com/recuperar-senha](https://nivelevelo.com/recuperar-senha).",
      "esqueci minha senha"
    );

    expect(output).toBe("Acesse https://nivelevelo.com/recuperar-senha.");
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
