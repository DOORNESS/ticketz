const MEMORY_CACHE = new Map();
const SESSION_PREFIX = "ticketz:tickets:";
const CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeParam = value =>
  value === undefined || value === null ? null : value;

export const buildTicketsCacheKey = ({
  isSearch,
  searchParam,
  contactId,
  tags,
  users,
  status,
  groups,
  date,
  updatedAt,
  showAll,
  queueIds,
  whatsappIds,
  brandIds,
  withUnreadMessages,
  notClosed,
  all,
  aiFilter,
  supervision
}) =>
  JSON.stringify({
    isSearch: normalizeParam(isSearch),
    searchParam: normalizeParam(searchParam),
    contactId: normalizeParam(contactId),
    tags: normalizeParam(tags),
    users: normalizeParam(users),
    status: normalizeParam(status),
    groups: normalizeParam(groups),
    date: normalizeParam(date),
    updatedAt: normalizeParam(updatedAt),
    showAll: normalizeParam(showAll),
    queueIds: normalizeParam(queueIds),
    whatsappIds: normalizeParam(whatsappIds),
    brandIds: normalizeParam(brandIds),
    withUnreadMessages: normalizeParam(withUnreadMessages),
    notClosed: normalizeParam(notClosed),
    all: normalizeParam(all),
    aiFilter: normalizeParam(aiFilter),
    supervision: normalizeParam(supervision)
  });

const readSessionEntry = cacheKey => {
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${cacheKey}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.tickets || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(`${SESSION_PREFIX}${cacheKey}`);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const readTicketsCache = cacheKey => {
  const memoryEntry = MEMORY_CACHE.get(cacheKey);
  if (memoryEntry && Date.now() - memoryEntry.fetchedAt <= CACHE_TTL_MS) {
    return memoryEntry;
  }

  if (memoryEntry) {
    MEMORY_CACHE.delete(cacheKey);
  }

  const sessionEntry = readSessionEntry(cacheKey);
  if (sessionEntry) {
    MEMORY_CACHE.set(cacheKey, sessionEntry);
  }

  return sessionEntry;
};

export const writeTicketsCache = (cacheKey, tickets) => {
  const entry = {
    tickets,
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

export const invalidateTicketsCache = () => {
  MEMORY_CACHE.clear();

  try {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(SESSION_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // ignore
  }
};
