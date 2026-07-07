const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 200;

export const splitTextIntoChunks = (
  text: string
): { content: string; metadata: Record<string, unknown> }[] => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: { content: string; metadata: Record<string, unknown> }[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({
        content,
        metadata: { chunkIndex: index }
      });
      index += 1;
    }
    if (end >= normalized.length) {
      break;
    }
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
};
