/**
 * Purga do áudio depois da transcrição.
 *
 * A transcrição já é gravada em `Message.body` ANTES do upload, e duplicada em
 * `MessageMediaFile.transcriptionText`. O histórico da conversa portanto não
 * depende do arquivo: apagar o objeto do B2 não remove uma linha sequer do que
 * o operador lê na tela.
 *
 * O que se perde é irreversível e está registrado de propósito: acaba a
 * re-transcrição manual, acaba a conferência de uma transcrição duvidosa e
 * acaba a nuance (tom de voz, ruído, cliente alterado). Por isso as quatro
 * condições abaixo são todas obrigatórias — nenhuma delas é conveniência.
 */

export type AudioPurgeCandidate = {
  mediaType?: string | null;
  direction?: string | null;
  transcriptionText?: string | null;
  retentionExempt?: boolean | null;
  storageKey?: string | null;
  createdAt?: Date | string | null;
};

export type AudioPurgeDecision =
  | { purge: true }
  | { purge: false; reason: AudioPurgeSkipReason };

export type AudioPurgeSkipReason =
  | "disabled"
  | "not_audio"
  | "not_inbound"
  | "no_transcription"
  | "retention_exempt"
  | "no_storage_key"
  | "within_grace_period";

/** Trava dupla, como o resto da plataforma. Nasce desligada. */
export const isAudioPurgeEnabled = (
  companySetting?: string | null
): boolean => {
  if (process.env.AI_PURGE_TRANSCRIBED_AUDIO !== "true") {
    return false;
  }
  return (
    String(companySetting || "")
      .trim()
      .toLowerCase() === "enabled"
  );
};

/**
 * Carência antes de apagar. Zero = apaga assim que transcreve.
 *
 * A economia no B2 vem do volume acumulado, não das últimas horas, então uma
 * carência curta preserva quase todo o ganho e ainda dá janela para alguém
 * perceber uma transcrição ruim enquanto o áudio ainda existe.
 */
export const getAudioPurgeGraceMinutes = (): number => {
  const parsed = Number(
    process.env.AI_PURGE_TRANSCRIBED_AUDIO_GRACE_MIN || "0"
  );
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

const hasUsableTranscription = (text?: string | null): boolean =>
  Boolean(text && text.trim().length >= 2);

export const decideAudioPurge = (
  candidate: AudioPurgeCandidate,
  {
    enabled,
    graceMinutes = 0,
    now = new Date()
  }: { enabled: boolean; graceMinutes?: number; now?: Date }
): AudioPurgeDecision => {
  if (!enabled) {
    return { purge: false, reason: "disabled" };
  }

  if ((candidate.mediaType || "").toLowerCase() !== "audio") {
    return { purge: false, reason: "not_audio" };
  }

  // Áudio que o operador envia não passa por transcrição: apagá-lo destruiria
  // conteúdo sem nenhum texto equivalente.
  if ((candidate.direction || "").toLowerCase() !== "inbound") {
    return { purge: false, reason: "not_inbound" };
  }

  // Transcrição falhou: o áudio é o ÚNICO registro do que o cliente disse.
  if (!hasUsableTranscription(candidate.transcriptionText)) {
    return { purge: false, reason: "no_transcription" };
  }

  // Protege o que foi anexado à base de conhecimento.
  if (candidate.retentionExempt) {
    return { purge: false, reason: "retention_exempt" };
  }

  if (!candidate.storageKey?.trim()) {
    return { purge: false, reason: "no_storage_key" };
  }

  if (graceMinutes > 0) {
    const createdAt = candidate.createdAt
      ? new Date(candidate.createdAt)
      : null;
    const validCreatedAt =
      createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;

    // Sem data confiável, não dá para provar que a carência venceu. Fail-closed:
    // preserva o áudio.
    if (!validCreatedAt) {
      return { purge: false, reason: "within_grace_period" };
    }

    const ageMinutes = (now.getTime() - validCreatedAt.getTime()) / 60000;
    if (ageMinutes < graceMinutes) {
      return { purge: false, reason: "within_grace_period" };
    }
  }

  return { purge: true };
};
