import fs from "fs";
import path from "path";

const read = (file: string): string =>
  fs.readFileSync(path.join(__dirname, "..", file), "utf-8");

const queueSrc = read("AiInboundQueueService.ts");
const processSrc = read("ProcessInboundMessageService.ts");

/**
 * O motor do loop não estava numa função só: eram três peças que só juntas
 * produziam trabalho infinito. Estes testes leem o código para que nenhuma
 * volte sozinha numa refatoração futura.
 */
describe("fila de entrada da IA — motor do loop desligado", () => {
  it("a última tentativa do Bull não é tratada como se ainda houvesse orçamento", () => {
    expect(queueSrc).toMatch(/job\.attemptsMade \+ 1 < getMaxAttempts\(\)/);
    expect(queueSrc).not.toMatch(/job\.attemptsMade < getMaxAttempts\(\)/);
  });

  it("um turno que falhou não agenda job novo", () => {
    expect(queueSrc).toMatch(/if \(ownsLock && !turnFailed\)/);
    expect(queueSrc).toMatch(/turnFailed = true;/);
  });

  it("o erro do provedor é registrado na primeira falha, antes de qualquer throw", () => {
    const catchIndex = queueSrc.indexOf("const permanent = isPermanentAiError");
    const logIndex = queueSrc.indexOf('action: "job_failed"');
    const throwIndex = queueSrc.indexOf("throw error;", catchIndex);
    expect(catchIndex).toBeGreaterThan(-1);
    expect(logIndex).toBeGreaterThan(catchIndex);
    expect(logIndex).toBeLessThan(throwIndex);
  });

  it("ao estourar o orçamento, o buffer é descartado e o ticket vai para uma pessoa", () => {
    expect(queueSrc).toMatch(/await redis\.del\(bufferKey\(ticketId\)\);/);
    expect(queueSrc).toMatch(/await removePendingDebounceJob\(ticketId\)/);
    expect(queueSrc).toMatch(/escalateAfterExhaustedFailures/);
    expect(queueSrc).toMatch(/HandoffToHumanService/);
  });

  it("um turno bem-sucedido zera o disjuntor", () => {
    expect(queueSrc).toMatch(/await clearTicketFailures\(redis, ticketId\)/);
  });
});

describe("fallback ao cliente", () => {
  it("a chave de dedupe inclui o motivo", () => {
    expect(processSrc).toMatch(
      /ai:fallback:sent:\$\{ticketId\}:\$\{reason\}:\$\{messageId\}/
    );
  });

  it("entrega que falhou libera a reserva em vez de calar a IA pela janela toda", () => {
    expect(processSrc).toMatch(/releaseDedupeKey/);
  });

  it("fallback suprimido ainda finaliza o estado do ticket", () => {
    const supressao = processSrc.indexOf("AI fallback suppressed by dedupe");
    const finaliza = processSrc.indexOf("finalizeAiResponse", supressao);
    expect(supressao).toBeGreaterThan(-1);
    expect(finaliza).toBeGreaterThan(supressao);
  });

  it("o guarda de resposta obrigatória segue com anti-repetição ligado", () => {
    // Só o código conta: o comentário que proíbe a volta do `skipDedupe: true`
    // cita a expressão de propósito.
    const semComentarios = processSrc
      .split("\n")
      .filter(
        line => !line.trim().startsWith("//") && !line.trim().startsWith("*")
      )
      .join("\n");
    expect(semComentarios).not.toMatch(/skipDedupe:\s*true/);
    expect(processSrc).toMatch(/MANDATORY_GUARD_DEDUPE_TTL_SEC\(\)/);
  });

  it("repetir fallback demais vira handoff humano", () => {
    expect(processSrc).toMatch(/shouldEscalateInsteadOfFallback/);
    expect(processSrc).toMatch(/consecutive_fallback_limit/);
  });

  it("resposta real zera o contador de fallbacks", () => {
    expect(processSrc).toMatch(/clearFallbackStreak/);
  });
});
