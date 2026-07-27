import { detectRequiresHumanAccountEscalation } from "../AiHelpers";
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

  it("includes support phone for password reset requests", () => {
    const output = prepareCustomerFacingAiText(
      "Entendi, vou te orientar.",
      "preciso resetar minha senha"
    );

    expect(detectRequiresHumanAccountEscalation("preciso resetar minha senha")).toBe(
      true
    );
    expect(output).toMatch(/99165-8811/);
  });
});

describe("sanitizeAiOutboundText phone stripping", () => {
  it("strips phone unless explicitly allowed", () => {
    const input = "Fale no (17) 99165-8811";
    expect(sanitizeAiOutboundText(input)).not.toMatch(/99165/);
    expect(
      sanitizeAiOutboundText(input, { allowSupportPhone: true })
    ).toMatch(/99165/);
  });
});
