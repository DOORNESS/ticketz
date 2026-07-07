export const isMissingAiTableError = (error: unknown): boolean => {
  const message = String((error as Error)?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    (message.includes("relation") && message.includes("not exist"))
  );
};

export const safeAiQuery = async <T>(
  query: () => Promise<T>,
  fallback: T
): Promise<T> => {
  try {
    return await query();
  } catch (error) {
    if (isMissingAiTableError(error)) {
      return fallback;
    }
    throw error;
  }
};
