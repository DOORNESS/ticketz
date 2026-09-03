/**
 * Prova que a purga de áudio está LIGADA ao fluxo real.
 *
 * `TranscribedAudioPurgePolicy.spec.ts` cobre a decisão pura. Este arquivo
 * cobre a fiação: a função já existiu uma vez sem nenhum chamador, e o teste
 * unitário da política passava do mesmo jeito. Se alguém desligar a chamada,
 * aqui fica vermelho.
 */
import fs from "fs";
import path from "path";

const resolverPath = path.join(__dirname, "..", "MediaInboundResolver.ts");
const resolverSrc = fs.readFileSync(resolverPath, "utf8");

const persistenciaPath = path.join(
  __dirname,
  "..",
  "media",
  "UnifiedMediaPersistenceService.ts"
);
const persistenciaSrc = fs.readFileSync(persistenciaPath, "utf8");

describe("a purga está conectada ao fluxo de áudio", () => {
  it("MediaInboundResolver importa e CHAMA purgeTranscribedAudio", () => {
    expect(resolverSrc).toMatch(
      /import \{ purgeTranscribedAudio \} from "\.\/media\/UnifiedMediaPersistenceService"/
    );
    expect(resolverSrc).toMatch(/await purgeTranscribedAudio\(mediaFileId\)/);
  });

  it("a chamada acontece DEPOIS da transcrição bem-sucedida", () => {
    const falhou = resolverSrc.indexOf("__AUDIO_TRANSCRIPTION_FAILED__");
    const chamada = resolverSrc.indexOf("await purgeTranscribedAudio");

    expect(falhou).toBeGreaterThan(-1);
    expect(chamada).toBeGreaterThan(falhou);
  });

  it("a chamada acontece DEPOIS da persistência da transcrição", () => {
    const persiste = resolverSrc.indexOf("transcriptionText: messageText");
    const chamada = resolverSrc.indexOf("await purgeTranscribedAudio");

    expect(persiste).toBeGreaterThan(-1);
    expect(chamada).toBeGreaterThan(persiste);
  });

  it("transcrição falha retorna antes de qualquer purga", () => {
    // O early-return de falha vem antes da atribuição de mediaFileId, então
    // não existe caminho em que a purga rode com transcrição falha.
    const guarda = resolverSrc.indexOf(
      'return "__AUDIO_TRANSCRIPTION_FAILED__"'
    );
    const atribuicao = resolverSrc.indexOf("let mediaFileId");

    expect(guarda).toBeGreaterThan(-1);
    expect(atribuicao).toBeGreaterThan(guarda);
  });

  it("usa o id da mídia existente e o id da recém-persistida", () => {
    expect(resolverSrc).toMatch(/mediaFileId = existingMedia\.id/);
    expect(resolverSrc).toMatch(/mediaFileId = persisted\?\.id \?\? null/);
  });

  it("falha de persistência zera o id — sem persistência não há purga", () => {
    expect(resolverSrc).toMatch(/mediaFileId = null;/);
  });

  it("a purga é guardada por if e não derruba o atendimento", () => {
    expect(resolverSrc).toMatch(/if \(mediaFileId\) \{/);
    // `.catch` garante que uma falha de storage não propaga para o fluxo.
    expect(resolverSrc).toMatch(
      /await purgeTranscribedAudio\(mediaFileId\)\.catch/
    );
  });

  it("mídia existente sem transcrição passa a ter o texto gravado", () => {
    expect(resolverSrc).toMatch(
      /existingMedia\.update\(\{ transcriptionText: messageText \}\)/
    );
  });
});

describe("purgeTranscribedAudio prova a persistência antes de apagar", () => {
  it("relê o registro do banco em vez de confiar no que veio em memória", () => {
    expect(persistenciaSrc).toMatch(
      /MessageMediaFile\.findByPk\(mediaFileId\)/
    );
  });

  it("delega todas as condições para decideAudioPurge", () => {
    expect(persistenciaSrc).toMatch(/decideAudioPurge\(/);
    expect(persistenciaSrc).toMatch(
      /if \(!decision\.purge\) \{\s*return false;/
    );
  });

  it("preserva o registro como rastro: deleted + deletedAt, sem destroy", () => {
    expect(persistenciaSrc).toMatch(/status: "deleted"/);
    expect(persistenciaSrc).toMatch(/deletedAt: new Date\(\)/);
    expect(persistenciaSrc).not.toMatch(/media\.destroy\(/);
  });

  it("falha de storage vira delete_failed para retentativa", () => {
    expect(persistenciaSrc).toMatch(/status: "delete_failed"/);
    expect(persistenciaSrc).toMatch(/lastDeleteError/);
  });
});

describe("a correção do loop de fallback continua intacta", () => {
  const processSrc = fs.readFileSync(
    path.join(__dirname, "..", "ProcessInboundMessageService.ts"),
    "utf8"
  );

  it("o mandatory guard NÃO usa skipDedupe", () => {
    // Comentários fora: o arquivo contém de propósito a frase "NUNCA volte a
    // skipDedupe: true", e ela não pode ser confundida com código.
    const semComentarios = processSrc
      .split("\n")
      .filter(linha => !linha.trim().startsWith("//"))
      .join("\n");

    const guarda = semComentarios.slice(
      semComentarios.indexOf("mandatory_reply_guard")
    );
    const proximoBloco = guarda.slice(0, 700);

    expect(proximoBloco).not.toMatch(/skipDedupe:\s*true/);
    expect(proximoBloco).toMatch(/dedupeTtlSeconds/);
  });

  it("nenhum chamador do fallback liga skipDedupe em código", () => {
    const semComentarios = processSrc
      .split("\n")
      .filter(linha => !linha.trim().startsWith("//"))
      .join("\n");

    expect(semComentarios).not.toMatch(/skipDedupe:\s*true/);
  });

  it("a chave de dedupe usa messageId e, sem ele, hash do texto", () => {
    // O `reason` entrou na chave: sem ele, motivos com janelas diferentes
    // disputavam a mesma reserva e um calava o outro.
    expect(processSrc).toMatch(
      /ai:fallback:sent:\$\{ticketId\}:\$\{reason\}:\$\{messageId\}/
    );
    expect(processSrc).toMatch(/createHash\("sha1"\)/);
  });
});
