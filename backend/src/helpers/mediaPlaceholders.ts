const AUDIO_PLACEHOLDERS = new Set([
  "🔊",
  "🎵",
  "🎤",
  "audio",
  "áudio",
  "Audio",
  "Áudio"
]);

export const isAudioPlaceholder = (text?: string | null): boolean => {
  if (!text) {
    return true;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (AUDIO_PLACEHOLDERS.has(trimmed)) {
    return true;
  }

  return /^[🔊🎵🎤\s]+$/.test(trimmed);
};

export const isEffectiveMessageText = (text?: string | null): boolean =>
  Boolean(text?.trim()) && !isAudioPlaceholder(text);
