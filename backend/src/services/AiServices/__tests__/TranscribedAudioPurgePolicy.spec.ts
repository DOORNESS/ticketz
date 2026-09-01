import {
  decideAudioPurge,
  isAudioPurgeEnabled
} from "../media/TranscribedAudioPurgePolicy";

const base = {
  mediaType: "audio",
  direction: "inbound",
  transcriptionText:
    "Toda vez que eu vou tentar entrar, fala que está incorreto.",
  retentionExempt: false,
  storageKey: "companies/1/tickets/138/messages/abc/uuid.ogg",
  createdAt: new Date("2026-09-01T10:00:00.000Z")
};

const ligado = { enabled: true, now: new Date("2026-09-01T12:00:00.000Z") };

describe("trava dupla", () => {
  const env = process.env.AI_PURGE_TRANSCRIBED_AUDIO;
  afterEach(() => {
    process.env.AI_PURGE_TRANSCRIBED_AUDIO = env;
  });

  it("nasce desligada: env sem Setting não liga", () => {
    process.env.AI_PURGE_TRANSCRIBED_AUDIO = "true";
    expect(isAudioPurgeEnabled(null)).toBe(false);
    expect(isAudioPurgeEnabled("disabled")).toBe(false);
  });

  it("Setting sem env também não liga", () => {
    process.env.AI_PURGE_TRANSCRIBED_AUDIO = "false";
    expect(isAudioPurgeEnabled("enabled")).toBe(false);
  });

  it("só liga com os dois", () => {
    process.env.AI_PURGE_TRANSCRIBED_AUDIO = "true";
    expect(isAudioPurgeEnabled("enabled")).toBe(true);
  });
});

describe("condições de purga", () => {
  it("áudio transcrito e inbound pode ser apagado", () => {
    expect(decideAudioPurge(base, ligado)).toEqual({ purge: true });
  });

  it("desligado nunca apaga", () => {
    expect(decideAudioPurge(base, { enabled: false })).toEqual({
      purge: false,
      reason: "disabled"
    });
  });

  it("transcrição falhou: o áudio é o único registro, preserva", () => {
    expect(
      decideAudioPurge({ ...base, transcriptionText: "" }, ligado)
    ).toEqual({ purge: false, reason: "no_transcription" });

    expect(
      decideAudioPurge({ ...base, transcriptionText: null }, ligado)
    ).toEqual({ purge: false, reason: "no_transcription" });
  });

  it("áudio do operador (outbound) não é transcrito — preserva", () => {
    expect(
      decideAudioPurge({ ...base, direction: "outbound" }, ligado)
    ).toEqual({ purge: false, reason: "not_inbound" });
  });

  it("anexado à base de conhecimento é intocável", () => {
    expect(
      decideAudioPurge({ ...base, retentionExempt: true }, ligado)
    ).toEqual({ purge: false, reason: "retention_exempt" });
  });

  it("não é áudio: fora do escopo", () => {
    expect(decideAudioPurge({ ...base, mediaType: "image" }, ligado)).toEqual({
      purge: false,
      reason: "not_audio"
    });
  });

  it("sem storageKey não há o que apagar", () => {
    expect(decideAudioPurge({ ...base, storageKey: "" }, ligado)).toEqual({
      purge: false,
      reason: "no_storage_key"
    });
  });
});

describe("carência", () => {
  it("dentro da carência preserva", () => {
    expect(
      decideAudioPurge(base, {
        enabled: true,
        graceMinutes: 240,
        now: new Date("2026-09-01T11:00:00.000Z")
      })
    ).toEqual({ purge: false, reason: "within_grace_period" });
  });

  it("vencida a carência, apaga", () => {
    expect(
      decideAudioPurge(base, {
        enabled: true,
        graceMinutes: 60,
        now: new Date("2026-09-01T12:00:00.000Z")
      })
    ).toEqual({ purge: true });
  });

  it("sem data confiável, fail-closed: preserva", () => {
    expect(
      decideAudioPurge(
        { ...base, createdAt: null },
        { enabled: true, graceMinutes: 60 }
      )
    ).toEqual({ purge: false, reason: "within_grace_period" });
  });
});
