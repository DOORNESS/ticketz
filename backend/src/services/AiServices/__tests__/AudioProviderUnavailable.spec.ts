import fs from "fs";
import path from "path";
import { isPermanentAiError } from "../isTransientAiError";
import { PROVIDER_UNAVAILABLE_REASON } from "../AudioTranscriptionService";

const read = (file: string): string =>
  fs.readFileSync(path.join(__dirname, "..", file), "utf-8");

/**
 * Um cliente mandou um áudio de 3 segundos e leu "Não consegui compreender
 * este áudio. Poderia reenviá-lo?". O áudio estava perfeito: o log mostra
 * `buffer_loaded`, `mime_detected` (audio/ogg; codecs=opus) e
 * `transcribe_start` — e então a OpenAI devolveu 429 `insufficient_quota`.
 *
 * Mandar o cliente regravar nesse cenário é empurrar para ele a culpa de uma
 * fatura nossa, e ele vai regravar para sempre sem nunca funcionar.
 */
describe("áudio quando o provedor recusa a chamada", () => {
  it("429 insufficient_quota da transcrição é erro permanente", () => {
    const err = Object.assign(new Error("You exceeded your current quota"), {
      status: 429,
      error: { type: "insufficient_quota" }
    });
    expect(isPermanentAiError(err)).toBe(true);
  });

  it("a transcrição desiste na hora em vez de tentar o outro modelo", () => {
    const src = read("AudioTranscriptionService.ts");
    const catchIdx = src.indexOf("const permanent = isPermanentAiError(error)");
    const bailIdx = src.indexOf("if (permanent) {", catchIdx);
    const sleepIdx = src.indexOf("await sleep(400 * attempt)", catchIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(bailIdx).toBeGreaterThan(catchIdx);
    expect(bailIdx).toBeLessThan(sleepIdx);
  });

  it("chave ausente e recusa do provedor usam o mesmo motivo", () => {
    const src = read("AudioTranscriptionService.ts");
    expect(PROVIDER_UNAVAILABLE_REASON).toBe("provider_unavailable");
    expect(src).not.toMatch(/errorReason: "missing_openai_api_key"/);
  });

  it("o resolver separa 'áudio ruim' de 'provedor fora'", () => {
    const src = read("MediaInboundResolver.ts");
    expect(src).toMatch(/__AUDIO_TRANSCRIPTION_UNAVAILABLE__/);
    expect(src).toMatch(/__AUDIO_TRANSCRIPTION_FAILED__/);
    const unavailable = src.indexOf("__AUDIO_TRANSCRIPTION_UNAVAILABLE__");
    const failed = src.lastIndexOf("__AUDIO_TRANSCRIPTION_FAILED__");
    // o caso do provedor tem que ser testado ANTES do genérico
    expect(unavailable).toBeLessThan(failed);
  });

  it("provedor fora vira atendimento humano, não 'reenvie o áudio'", () => {
    const src = read("ProcessInboundMessageService.ts");
    const idx = src.indexOf(
      'userText === "__AUDIO_TRANSCRIPTION_UNAVAILABLE__"'
    );
    expect(idx).toBeGreaterThan(-1);

    // recorta exatamente este ramo: do teste do sentinel até o início do
    // ramo seguinte, que é o do áudio genuinamente ruim
    const fim = src.indexOf("if (!userText || userText ===", idx);
    expect(fim).toBeGreaterThan(idx);
    const bloco = src.slice(idx, fim);
    expect(bloco).toMatch(/HandoffToHumanService/);
    expect(bloco).toMatch(/AI_HANDOFF_REASONS\.provider_error/);
    expect(bloco).not.toMatch(/AUDIO_USER_FALLBACK/);
  });

  it("o pedido de reenviar o áudio continua existindo para áudio realmente ruim", () => {
    const src = read("ProcessInboundMessageService.ts");
    expect(src).toMatch(/Não consegui compreender este áudio/);
    expect(src).toMatch(/userText === "__AUDIO_TRANSCRIPTION_FAILED__"/);
  });
});
