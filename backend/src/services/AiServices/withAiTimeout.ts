export class AiOperationTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label}_TIMEOUT_${timeoutMs}ms`);
    this.name = "AiOperationTimeoutError";
  }
}

export const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const withAiTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AiOperationTimeoutError(label, timeoutMs)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};
