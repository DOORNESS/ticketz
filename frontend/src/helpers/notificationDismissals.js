/**
 * Notificações dispensadas no sino do cabeçalho.
 *
 * O sino repete conversas que já estão na lista ao lado. Ele só se justifica se
 * o operador puder zerá-lo: abrir a conversa dispensa, e o "x" dispensa sem
 * abrir. Sem persistir a dispensa o botão seria decorativo — o próximo refetch
 * de `useTickets` (que busca por `unreadMessages > 0`) traria tudo de volta.
 *
 * O registro guarda `ticketId → updatedAt do momento da dispensa`. Isso separa
 * as duas situações que parecem iguais na lista:
 *
 * - refetch do mesmo estado → `updatedAt` igual → continua dispensado
 * - mensagem nova          → `updatedAt` maior  → volta a notificar
 *
 * Eventos de socket de mensagem nova chamam `undismiss` explicitamente, porque
 * o payload de `appMessage` nem sempre traz `updatedAt` fresco e nesse caminho
 * a comparação de data não é confiável.
 *
 * Isolado por usuário; nada aqui é autorização, só conforto de leitura.
 */

const STORAGE_PREFIX = "ticketz:notifDismissed:";
const MAX_ENTRIES = 200;

export const dismissalStorageKey = userId =>
  `${STORAGE_PREFIX}${userId || "anon"}`;

export const readDismissals = userId => {
  try {
    const raw = window.localStorage.getItem(dismissalStorageKey(userId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Mantém as entradas mais recentes. O sino é efêmero por natureza: guardar
 * dispensa antiga só ocuparia `localStorage` sem mudar nada na tela.
 */
export const pruneDismissals = map => {
  const entries = Object.entries(map || {});
  if (entries.length <= MAX_ENTRIES) {
    return { ...map };
  }

  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => String(b).localeCompare(String(a)))
      .slice(0, MAX_ENTRIES)
  );
};

export const writeDismissals = (userId, map) => {
  const pruned = pruneDismissals(map);
  try {
    window.localStorage.setItem(
      dismissalStorageKey(userId),
      JSON.stringify(pruned)
    );
  } catch {
    // Cota cheia ou aba anônima: a dispensa vale só em memória nesta sessão.
  }
  return pruned;
};

export const withDismissedTicket = (map, ticket) => {
  if (!ticket?.id) {
    return { ...map };
  }

  return {
    ...map,
    [ticket.id]: ticket.updatedAt || new Date().toISOString()
  };
};

export const withoutDismissedTicket = (map, ticketId) => {
  if (!ticketId || !(ticketId in (map || {}))) {
    return map || {};
  }

  const next = { ...map };
  delete next[ticketId];
  return next;
};

export const isTicketDismissed = (map, ticket) => {
  const dismissedAt = map?.[ticket?.id];
  if (!dismissedAt) {
    return false;
  }

  // Sem `updatedAt` não há como provar que houve atividade nova. Mantém
  // dispensado: mensagem de verdade chega por socket e chama `undismiss`.
  if (!ticket?.updatedAt) {
    return true;
  }

  return (
    new Date(ticket.updatedAt).getTime() <= new Date(dismissedAt).getTime()
  );
};
