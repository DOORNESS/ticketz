import { logger } from "../../utils/logger";

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const isTransientStorageError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("503") ||
    message.includes("500") ||
    message.includes("slow down") ||
    message.includes("throttl")
  );
};

export const withStorageRetry = async <T>(
  operation: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientStorageError(error)) {
        throw error;
      }

      const delayMs = Math.min(5000, 250 * 2 ** (attempt - 1));
      logger.warn(
        { operation, attempt, delayMs },
        "Transient storage error, retrying"
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};
