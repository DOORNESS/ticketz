const MEMORY_CACHE = new Map();
const SESSION_PREFIX = "ticketz:ai:";
const CACHE_TTL_MS = 5 * 60 * 1000;

const readSessionEntry = cacheKey => {
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${cacheKey}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(`${SESSION_PREFIX}${cacheKey}`);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const readAiListCache = cacheKey => {
  const memoryEntry = MEMORY_CACHE.get(cacheKey);
  if (memoryEntry && Date.now() - memoryEntry.fetchedAt <= CACHE_TTL_MS) {
    return memoryEntry.data;
  }

  if (memoryEntry) {
    MEMORY_CACHE.delete(cacheKey);
  }

  const sessionEntry = readSessionEntry(cacheKey);
  if (sessionEntry) {
    MEMORY_CACHE.set(cacheKey, sessionEntry);
    return sessionEntry.data;
  }

  return null;
};

export const writeAiListCache = (cacheKey, data) => {
  const entry = {
    data,
    fetchedAt: Date.now()
  };

  MEMORY_CACHE.set(cacheKey, entry);

  try {
    sessionStorage.setItem(
      `${SESSION_PREFIX}${cacheKey}`,
      JSON.stringify(entry)
    );
  } catch {
    // sessionStorage may be full or unavailable
  }
};

export const invalidateAiListCache = prefix => {
  const matchPrefix = prefix || "";

  [...MEMORY_CACHE.keys()].forEach(key => {
    if (!matchPrefix || key.startsWith(matchPrefix)) {
      MEMORY_CACHE.delete(key);
    }
  });

  try {
    Object.keys(sessionStorage).forEach(key => {
      if (
        key.startsWith(SESSION_PREFIX) &&
        (!matchPrefix ||
          key.slice(SESSION_PREFIX.length).startsWith(matchPrefix))
      ) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // ignore
  }
};

export const AI_CACHE_KEYS = {
  knowledgeBases: "knowledge-bases:index",
  knowledgeDomains: "knowledge-domains:index",
  assetsList: filters =>
    `assets:list:${JSON.stringify({
      knowledgeBaseId: filters.knowledgeBaseId || "",
      lifecycleStatus: filters.lifecycleStatus || ""
    })}`
};
