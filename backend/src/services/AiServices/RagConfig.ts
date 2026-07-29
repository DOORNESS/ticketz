const parseNumber = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

export const RAG_CHUNK_SIZE = 1800;
export const RAG_CHUNK_OVERLAP = 200;
export const RAG_MAX_CONTEXT_CHARS = 20000;
export const RAG_RETRIEVAL_LIMIT = 8;
export const RAG_RETRIEVAL_CANDIDATE_LIMIT = 24;

export const getRagMinimumSimilarity = (): number =>
  parseNumber(process.env.AI_RAG_MIN_SIMILARITY, 0.25, 0, 1);

export const getRagNeighborWindow = (): number =>
  Math.round(parseNumber(process.env.AI_RAG_NEIGHBOR_WINDOW, 1, 0, 2));
