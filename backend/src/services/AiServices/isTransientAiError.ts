type ErrorLike = {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
  type?: string;
  error?: { code?: string; type?: string; message?: string };
  response?: {
    status?: number;
    data?: { error?: { code?: string; type?: string } };
  };
};

const readMessage = (err: ErrorLike): string =>
  [err?.message, err?.error?.message].filter(Boolean).join(" ").toLowerCase();

const readCodes = (err: ErrorLike): string =>
  [
    err?.code,
    err?.type,
    err?.name,
    err?.error?.code,
    err?.error?.type,
    err?.response?.data?.error?.code,
    err?.response?.data?.error?.type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/**
 * Erros que NÃO adiantam repetir.
 *
 * Cota estourada, chave inválida, modelo inexistente e parâmetro recusado não
 * mudam com o tempo: retentar só multiplica a chamada que já foi negada. O
 * caso mais traiçoeiro é o 429 de `insufficient_quota` — traz o mesmo status
 * de um rate limit legítimo, mas é permanente até alguém pagar a fatura. Foi
 * assim que um ticket acumulou 2.416 reprocessamentos em 24 horas.
 */
export const isPermanentAiError = (error: unknown): boolean => {
  const err = error as ErrorLike;
  const message = readMessage(err);
  const codes = readCodes(err);
  const status = err?.status || err?.response?.status;

  const permanentMarkers = [
    "insufficient_quota",
    "exceeded your current quota",
    "billing",
    "invalid_api_key",
    "incorrect api key",
    "api key not configured",
    "invalid authentication",
    "model_not_found",
    "does not exist or you do not have access",
    "unsupported_parameter",
    "unsupported_value",
    "unrecognized request argument",
    "context_length_exceeded",
    "string_above_max_length",
    "content_policy_violation"
  ];

  if (permanentMarkers.some(marker => message.includes(marker))) {
    return true;
  }
  if (permanentMarkers.some(marker => codes.includes(marker))) {
    return true;
  }

  // 401/403 = credencial. 404 = modelo/rota inexistente. 400/422 = requisição
  // malformada. Nenhum deles se resolve sozinho.
  if (status === 400 || status === 401 || status === 403) return true;
  if (status === 404 || status === 422) return true;

  return false;
};

export const isTransientAiError = (error: unknown): boolean => {
  if (isPermanentAiError(error)) {
    return false;
  }

  const err = error as ErrorLike;
  const message = readMessage(err);
  const codes = readCodes(err);
  const status = err?.status || err?.response?.status;

  if (status === 429) return true;
  if (status === 408) return true;
  if (status === 409) return true;
  if (status && status >= 500) return true;

  if (
    err?.code === "ETIMEDOUT" ||
    err?.code === "ECONNRESET" ||
    err?.code === "ECONNREFUSED" ||
    err?.code === "ECONNABORTED" ||
    err?.code === "ENOTFOUND" ||
    err?.code === "EAI_AGAIN" ||
    err?.code === "EPIPE" ||
    err?.code === "ERR_SOCKET_CONNECTION_TIMEOUT"
  ) {
    return true;
  }

  // O SDK da OpenAI emite "Request timed out." (APIConnectionTimeoutError) e
  // "Connection error." (APIConnectionError). A grafia "timed out" não contém
  // "timeout", então o teste antigo deixava passar justamente o erro mais
  // comum de provedor lento.
  const transientMarkers = [
    "timeout",
    "timed out",
    "rate limit",
    "overloaded",
    "temporarily unavailable",
    "service unavailable",
    "connection error",
    "socket hang up",
    "fetch failed",
    "network error",
    "aborted",
    "econnreset",
    "server_error",
    "apiconnectionerror",
    "apiconnectiontimeouterror",
    "internal server error"
  ];

  if (transientMarkers.some(marker => message.includes(marker))) return true;
  if (transientMarkers.some(marker => codes.includes(marker))) return true;

  return false;
};
