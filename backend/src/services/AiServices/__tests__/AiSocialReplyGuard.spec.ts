import {
  isSimilarSocialAcknowledgement,
  isSocialAcknowledgementBody,
  normalizeSocialReplyText
} from "../AiSocialReplyGuard";
import { waitForInboundBufferQuietPeriod } from "../AiInboundBufferCoalesce";

describe("AiSocialReplyGuard", () => {
  it("detects similar social acknowledgements", () => {
    expect(
      isSimilarSocialAcknowledgement(
        "Claro! Como posso ajudar você hoje?",
        "Claro! Por favor, me diga como posso te ajudar."
      )
    ).toBe(true);
  });

  it("does not treat substantive answers as social duplicates", () => {
    expect(
      isSimilarSocialAcknowledgement(
        "Claro! Como posso ajudar você hoje?",
        "O site oficial é https://nivelvelo.com/chamado para abrir um chamado."
      )
    ).toBe(false);
  });

  it("normalizes accents and punctuation", () => {
    expect(
      isSocialAcknowledgementBody("Claro! Como posso ajudar voce hoje?")
    ).toBe(true);
    expect(normalizeSocialReplyText("Olá!!!")).toBe("ola");
  });
});

describe("AiInboundBufferCoalesce", () => {
  it("returns immediately when the buffer is empty", async () => {
    await expect(
      waitForInboundBufferQuietPeriod(async () => 0, 500)
    ).resolves.toBeUndefined();
  });
});
