type ErrorLike = {
  status?: number;
  code?: string;
  message?: string;
  type?: string;
  response?: {
    status?: number;
  };
};

export const isTransientAiError = (error: unknown): boolean => {
  const err = error as ErrorLike;
  const message = (err?.message || "").toLowerCase();
  const status = err?.status || err?.response?.status;

  if (status === 429) return true;
  if (status === 408) return true;
  if (status === 502 || status === 503 || status === 504) {
    return true;
  }

  if (
    err?.code === "ETIMEDOUT" ||
    err?.code === "ECONNRESET" ||
    err?.code === "ECONNREFUSED" ||
    err?.code === "ENOTFOUND" ||
    err?.code === "EAI_AGAIN"
  ) {
    return true;
  }

  if (message.includes("timeout")) return true;
  if (message.includes("rate limit")) return true;
  if (message.includes("overloaded")) return true;
  if (message.includes("temporarily unavailable")) return true;
  if (message.includes("connection error")) return true;
  if (err?.type === "server_error") return true;

  return false;
};
