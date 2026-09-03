import { logger } from "../../utils/logger";

/**
 * Disjuntor por ticket.
 *
 * Sem ele, um erro que se repete — cota estourada, chave recusada, provedor
 * fora do ar — vira trabalho infinito: cada falha devolve as mensagens ao
 * buffer e o buffer agenda outro job. Em 03/09 o ticket #153 acumulou 2.374
 * reprocessamentos em cinco horas com as mesmas três mensagens, e só parou
 * porque um atendente fechou o ticket à mão.
 *
 * O contador é por ticket e vive no Redis. Zera assim que um turno termina
 * bem; ao estourar o limite, quem chama para de reprocessar e escala.
 */

const streakKey = (ticketId: number): string => `ai:failstreak:${ticketId}`;

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const getMaxTicketFailures = (): number =>
  parsePositiveInt(process.env.AI_TICKET_MAX_CONSECUTIVE_FAILURES, 3);

const getStreakTtlSeconds = (): number =>
  parsePositiveInt(process.env.AI_TICKET_FAILURE_STREAK_TTL_SEC, 3600);

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

export const registerTicketFailure = async (
  redis: RedisLike,
  ticketId: number
): Promise<number> => {
  try {
    const failures = await redis.incr(streakKey(ticketId));
    await redis.expire(streakKey(ticketId), getStreakTtlSeconds());
    return failures;
  } catch (error) {
    // Sem Redis não há como contar. Devolver 1 mantém o comportamento
    // conservador: uma falha isolada ainda pode ser retentada.
    logger.warn({ error, ticketId }, "Failed to register AI failure streak");
    return 1;
  }
};

export const clearTicketFailures = async (
  redis: RedisLike,
  ticketId: number
): Promise<void> => {
  try {
    await redis.del(streakKey(ticketId));
  } catch (error) {
    logger.warn({ error, ticketId }, "Failed to clear AI failure streak");
  }
};

export const hasExhaustedTicketFailures = (failures: number): boolean =>
  failures >= getMaxTicketFailures();
