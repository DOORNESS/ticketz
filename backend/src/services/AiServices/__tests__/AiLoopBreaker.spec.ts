import { isTransientAiError, isPermanentAiError } from "../isTransientAiError";
import { buildFallbackDedupeKey } from "../ProcessInboundMessageService";
import {
  hasExhaustedTicketFailures,
  getMaxTicketFailures
} from "../AiTicketFailureBreaker";
import {
  isNoAnswerFallbackReason,
  getMaxConsecutiveFallbacks
} from "../AiFallbackStreakService";

/**
 * O ticket #153 recebeu a mesma frase às 08:29, 09:29, 10:29, 11:29 e 12:30,
 * e o banco de produção registrou 2.374 reprocessamentos do mesmo turno em
 * cinco horas. Estes testes travam cada peça que permitia isso.
 */
describe("classificação de erro do provedor", () => {
  it("reconhece o timeout do SDK da OpenAI, que escreve 'timed out'", () => {
    const err = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError"
    });
    expect(isTransientAiError(err)).toBe(true);
    expect(isPermanentAiError(err)).toBe(false);
  });

  it("reconhece 'Connection error.' do SDK", () => {
    expect(isTransientAiError(new Error("Connection error."))).toBe(true);
  });

  it("trata cota estourada como permanente, mesmo vindo com status 429", () => {
    const err = Object.assign(new Error("You exceeded your current quota"), {
      status: 429,
      error: { code: "insufficient_quota" }
    });
    expect(isPermanentAiError(err)).toBe(true);
    expect(isTransientAiError(err)).toBe(false);
  });

  it("trata chave inválida e modelo inexistente como permanentes", () => {
    expect(
      isPermanentAiError(
        Object.assign(new Error("Incorrect API key"), { status: 401 })
      )
    ).toBe(true);
    expect(
      isPermanentAiError(
        Object.assign(
          new Error("The model does not exist or you do not have access"),
          {
            status: 404
          }
        )
      )
    ).toBe(true);
  });

  it("mantém rate limit legítimo como transitório", () => {
    const err = Object.assign(new Error("Rate limit reached"), { status: 429 });
    expect(isTransientAiError(err)).toBe(true);
    expect(isPermanentAiError(err)).toBe(false);
  });

  it("erro 5xx do provedor continua transitório", () => {
    expect(isTransientAiError({ status: 503 })).toBe(true);
  });
});

describe("chave de anti-repetição", () => {
  it("separa por motivo mesmo quando há messageId", () => {
    const guarda = buildFallbackDedupeKey({
      ticketId: 153,
      messageId: "abc",
      reason: "mandatory_reply_guard",
      userText: "cancelar a conta"
    });
    const confianca = buildFallbackDedupeKey({
      ticketId: 153,
      messageId: "abc",
      reason: "low_confidence_fallback",
      userText: "cancelar a conta"
    });

    expect(guarda).not.toEqual(confianca);
    expect(guarda).toContain("mandatory_reply_guard");
  });

  it("mensagens diferentes do mesmo ticket não se calam entre si", () => {
    const a = buildFallbackDedupeKey({
      ticketId: 153,
      messageId: "m1",
      reason: "mandatory_reply_guard",
      userText: "oi"
    });
    const b = buildFallbackDedupeKey({
      ticketId: 153,
      messageId: "m2",
      reason: "mandatory_reply_guard",
      userText: "cancelar a conta"
    });
    expect(a).not.toEqual(b);
  });

  it("sem messageId, cai no hash do texto do cliente", () => {
    const a = buildFallbackDedupeKey({
      ticketId: 153,
      reason: "mandatory_reply_guard",
      userText: "cancelar a conta"
    });
    const b = buildFallbackDedupeKey({
      ticketId: 153,
      reason: "mandatory_reply_guard",
      userText: "quero saber do cashback"
    });
    expect(a).not.toEqual(b);
  });
});

describe("disjuntor por ticket", () => {
  it("desiste ao atingir o teto de falhas consecutivas", () => {
    const teto = getMaxTicketFailures();
    expect(teto).toBeGreaterThan(0);
    expect(hasExhaustedTicketFailures(teto - 1)).toBe(false);
    expect(hasExhaustedTicketFailures(teto)).toBe(true);
  });
});

describe("escalonamento por fallback repetido", () => {
  it("reconhece os motivos de 'não sei responder'", () => {
    expect(isNoAnswerFallbackReason("mandatory_reply_guard")).toBe(true);
    expect(isNoAnswerFallbackReason("informational_brand_fallback")).toBe(true);
    // instabilidade momentânea é outra conversa e não gasta o orçamento
    expect(isNoAnswerFallbackReason("processing_error_fallback")).toBe(false);
    expect(isNoAnswerFallbackReason("transient_provider_error_fallback")).toBe(
      false
    );
  });

  it("o teto de repetições é baixo o suficiente para o cliente não notar", () => {
    expect(getMaxConsecutiveFallbacks()).toBeLessThanOrEqual(3);
  });
});
