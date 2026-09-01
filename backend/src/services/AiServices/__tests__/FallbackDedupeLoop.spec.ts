import { buildFallbackDedupeKey } from "../ProcessInboundMessageService";

/**
 * Regressão do ticket #152: o cliente recebeu a MESMA frase de 2 em 2 minutos
 * por meia hora, porque o guarda de resposta obrigatória rodava com o
 * anti-repetição desligado e o ticket travado era reprocessado a cada
 * expiração do lock da fila.
 */
describe("anti-repetição do fallback", () => {
  it("mesma mensagem reprocessada gera a MESMA chave — a repetição é bloqueada", () => {
    const primeira = buildFallbackDedupeKey({
      ticketId: 152,
      messageId: "ABC123",
      reason: "mandatory_reply_guard",
      userText: "Ajuda"
    });

    const retentativa = buildFallbackDedupeKey({
      ticketId: 152,
      messageId: "ABC123",
      reason: "mandatory_reply_guard",
      userText: "Ajuda"
    });

    expect(primeira).toBe(retentativa);
  });

  it("pergunta nova do cliente gera chave nova — o guarda volta a valer", () => {
    const anterior = buildFallbackDedupeKey({
      ticketId: 152,
      messageId: "ABC123",
      reason: "mandatory_reply_guard",
      userText: "Ajuda"
    });

    const nova = buildFallbackDedupeKey({
      ticketId: 152,
      messageId: "XYZ789",
      reason: "mandatory_reply_guard",
      userText: "outra dúvida"
    });

    expect(nova).not.toBe(anterior);
  });

  it("sem messageId, o texto do cliente entra na chave", () => {
    // Antes a chave caía só no `reason`, constante por ticket: uma pergunta
    // genuinamente nova ficaria sem resposta durante toda a janela.
    const ajuda = buildFallbackDedupeKey({
      ticketId: 152,
      reason: "mandatory_reply_guard",
      userText: "Ajuda"
    });

    const outra = buildFallbackDedupeKey({
      ticketId: 152,
      reason: "mandatory_reply_guard",
      userText: "quero cancelar"
    });

    expect(ajuda).not.toBe(outra);
    expect(ajuda).toContain("152");
  });

  it("mesmo texto sem messageId continua sendo a mesma chave", () => {
    const a = buildFallbackDedupeKey({
      ticketId: 152,
      reason: "mandatory_reply_guard",
      userText: "Ajuda"
    });
    const b = buildFallbackDedupeKey({
      ticketId: 152,
      reason: "mandatory_reply_guard",
      userText: "  ajuda  "
    });

    expect(a).toBe(b);
  });

  it("tickets diferentes nunca colidem", () => {
    const t1 = buildFallbackDedupeKey({
      ticketId: 152,
      messageId: "ABC123",
      reason: "mandatory_reply_guard"
    });
    const t2 = buildFallbackDedupeKey({
      ticketId: 999,
      messageId: "ABC123",
      reason: "mandatory_reply_guard"
    });

    expect(t1).not.toBe(t2);
  });
});
