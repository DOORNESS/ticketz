import { logger } from "../../utils/logger";

/**
 * Conta fallbacks consecutivos de um ticket.
 *
 * Um "não encontrei na base" é uma resposta aceitável na primeira vez. Na
 * terceira, para o cliente é a prova de que ninguém está lendo — foi o que
 * aconteceu com quem pediu para cancelar a conta e recebeu a mesma frase de
 * hora em hora. Ao estourar o limite, o turno vira handoff humano em vez de
 * mais uma repetição.
 *
 * O contador zera quando a IA entrega uma resposta de verdade.
 */

const streakKey = (ticketId: number): string => `ai:fallbackstreak:${ticketId}`;

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const getMaxConsecutiveFallbacks = (): number =>
  parsePositiveInt(process.env.AI_MAX_CONSECUTIVE_FALLBACKS, 2);

const getStreakTtlSeconds = (): number =>
  parsePositiveInt(process.env.AI_FALLBACK_STREAK_TTL_SEC, 21600);

/** Motivos que representam "a IA não soube responder". */
const NO_ANSWER_REASONS = [
  "mandatory_reply_guard",
  "low_confidence_fallback",
  "informational_low_confidence_fallback",
  "empty_sanitized_response",
  "tool_handoff_without_reply",
  "queue_definitive_error_fallback",
  "informational_brand_fallback"
];

export const isNoAnswerFallbackReason = (reason: string): boolean =>
  NO_ANSWER_REASONS.includes(reason);

const getRedis = async () => {
  const { getAiInboundQueue } = await import("./AiInboundQueueService");
  return getAiInboundQueue().client;
};

export const registerFallbackDelivered = async (
  ticketId: number
): Promise<number> => {
  try {
    const redis = await getRedis();
    const total = await redis.incr(streakKey(ticketId));
    await redis.expire(streakKey(ticketId), getStreakTtlSeconds());
    return total;
  } catch (error) {
    logger.warn({ error, ticketId }, "Failed to register AI fallback streak");
    return 0;
  }
};

export const clearFallbackStreak = async (ticketId: number): Promise<void> => {
  try {
    const redis = await getRedis();
    await redis.del(streakKey(ticketId));
  } catch (error) {
    logger.warn({ error, ticketId }, "Failed to clear AI fallback streak");
  }
};

export const countFallbackStreak = async (
  ticketId: number
): Promise<number> => {
  try {
    const redis = await getRedis();
    const raw = await redis.get(streakKey(ticketId));
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (error) {
    logger.warn({ error, ticketId }, "Failed to read AI fallback streak");
    return 0;
  }
};

/**
 * Decide se este fallback deve virar handoff. Só vale para motivos de
 * "não sei responder" — um aviso de instabilidade momentânea é outra
 * conversa e não deve consumir o orçamento.
 */
export const shouldEscalateInsteadOfFallback = async ({
  ticketId,
  reason
}: {
  ticketId: number;
  reason: string;
}): Promise<boolean> => {
  if (!isNoAnswerFallbackReason(reason)) {
    return false;
  }
  const streak = await countFallbackStreak(ticketId);
  return streak >= getMaxConsecutiveFallbacks();
};
