/**
 * Classificação de desconexão e backoff de reconexão do WhatsApp.
 *
 * Módulo puro (sem model, socket ou timer) para ser testável isoladamente.
 *
 * Contexto: o handler tratava `428` como "QR expirado" e regenerava QR a cada
 * queda. `428` é `DisconnectReason.connectionClosed` — o WebSocket fechou. Não
 * diz nada sobre a validade da credencial. Só `401 (loggedOut)` e `403`
 * significam credencial inválida; regenerar QR fora desses casos joga fora uma
 * sessão boa e força o cliente a parear de novo sem motivo.
 */

export type DisconnectAction =
  /** Queda transitória: reconectar reaproveitando as credenciais. */
  | "reconnect"
  /** Outra instância assumiu a sessão: reconectar com espera maior. */
  | "conflict"
  /** Credencial inválida de fato: limpar sessão e pedir novo QR. */
  | "logout";

export type DisconnectClassification = {
  action: DisconnectAction;
  reason: string;
  /** Apagar credenciais só quando o WhatsApp confirma que elas morreram. */
  clearCredentials: boolean;
};

const LOGGED_OUT = 401;
const FORBIDDEN = 403;
const CONNECTION_REPLACED = 440;
const CONNECTION_CLOSED = 428;
const CONNECTION_LOST = 408;
const RESTART_REQUIRED = 515;
const BAD_SESSION = 500;

export const classifyDisconnect = (
  statusCode: number | undefined,
  rawError: unknown = ""
): DisconnectClassification => {
  const text = (
    typeof rawError === "string" ? rawError : JSON.stringify(rawError ?? "")
  ).toLowerCase();

  if (statusCode === LOGGED_OUT) {
    return {
      action: "logout",
      reason: "logged_out",
      clearCredentials: true
    };
  }

  if (statusCode === FORBIDDEN) {
    return {
      action: "logout",
      reason: "forbidden",
      clearCredentials: true
    };
  }

  // `badSession` indica credencial corrompida — o pareamento precisa recomeçar.
  if (statusCode === BAD_SESSION) {
    return {
      action: "logout",
      reason: "bad_session",
      clearCredentials: true
    };
  }

  if (statusCode === CONNECTION_REPLACED || text.includes("conflict")) {
    return {
      action: "conflict",
      reason: "connection_replaced",
      clearCredentials: false
    };
  }

  if (statusCode === CONNECTION_CLOSED) {
    return {
      action: "reconnect",
      reason: "connection_closed",
      clearCredentials: false
    };
  }

  if (statusCode === CONNECTION_LOST) {
    return {
      action: "reconnect",
      reason: "connection_lost",
      clearCredentials: false
    };
  }

  if (statusCode === RESTART_REQUIRED) {
    return {
      action: "reconnect",
      reason: "restart_required",
      clearCredentials: false
    };
  }

  // Desconhecido: reconectar preservando credenciais é o lado seguro do erro.
  // Descartar uma sessão válida custa um pareamento manual; tentar de novo não
  // custa nada além de alguns segundos.
  return {
    action: "reconnect",
    reason: statusCode ? `unknown_status_${statusCode}` : "unknown",
    clearCredentials: false
  };
};

const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60000;

/**
 * Backoff progressivo: 5s, 10s, 20s, 40s, 60s (teto).
 * `attempt` é 1-based e zera quando a conexão abre.
 */
export const nextBackoffMs = (
  attempt: number,
  { baseMs = BASE_BACKOFF_MS, maxMs = MAX_BACKOFF_MS } = {}
): number => {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
  const delay = baseMs * 2 ** (safeAttempt - 1);
  return Math.min(delay, maxMs);
};

/** Conflito espera mais: duas instâncias brigando precisam de folga. */
export const conflictBackoffMs = (attempt: number): number =>
  nextBackoffMs(attempt, { baseMs: 15000, maxMs: 120000 });
