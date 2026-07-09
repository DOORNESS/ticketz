const HANDOFF_REASON_LABELS = {
  customer_requested_human: "Cliente pediu atendente",
  low_confidence: "Baixa confiança da IA",
  sensitive_subject: "Assunto sensível",
  no_knowledge_found: "Informação não encontrada na base",
  provider_error: "Erro do provedor de IA",
  manual_takeover: "Atendente assumiu manualmente"
};

export const getHandoffReasonLabel = reason =>
  HANDOFF_REASON_LABELS[reason] || reason || null;

export const isAiHandlingTicket = ticket =>
  !!ticket?.aiAgentId &&
  !ticket?.aiHandoff &&
  !ticket?.aiPaused &&
  !ticket?.userId &&
  ticket?.status !== "closed";

export const isHandoffPendingTicket = ticket =>
  !!ticket?.aiHandoff && ticket?.status === "pending" && !ticket?.userId;

export const isHumanHandlingTicket = ticket =>
  !!ticket?.userId && ticket?.status === "open";

export const isAiPausedTicket = ticket =>
  !!ticket?.aiPaused && ticket?.status !== "closed";

export const isAiResolvedTicket = ticket =>
  !!ticket?.aiResolvedByAi && ticket?.status === "closed";

export const getAiTicketBadge = ticket => {
  if (isAiResolvedTicket(ticket)) {
    return { key: "ai_resolved", color: "#2e7d32", label: "Resolvido pela IA" };
  }
  if (isHandoffPendingTicket(ticket)) {
    return {
      key: "handoff_pending",
      color: "#c62828",
      label: "Aguardando humano"
    };
  }
  if (ticket?.aiHandoff && ticket?.userId) {
    return { key: "human_assumed", color: "#1565c0", label: "Humano assumiu" };
  }
  if (ticket?.aiHandoff && ticket?.status === "pending") {
    return {
      key: "ai_transferred",
      color: "#d32f2f",
      label: "IA transferiu"
    };
  }
  if (isAiPausedTicket(ticket)) {
    return { key: "ai_paused", color: "#ef6c00", label: "IA pausada" };
  }
  if (isAiHandlingTicket(ticket)) {
    return { key: "ai_handling", color: "#6a1b9a", label: "IA atendendo" };
  }
  return null;
};

export const formatWaitingTime = waitingSince => {
  if (!waitingSince) return null;
  const diffMs = Date.now() - new Date(waitingSince).getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = value => String(value).padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

export const canSuperviseAi = user =>
  user?.profile === "admin" || user?.super === true;

export const AI_SUPERVISION_FILTERS = [
  { value: "all", labelKey: "aiSupervision.filters.all" },
  { value: "ai_handling", labelKey: "aiSupervision.filters.aiHandling" },
  { value: "ai_resolved", labelKey: "aiSupervision.filters.aiResolved" },
  { value: "ai_transferred", labelKey: "aiSupervision.filters.aiTransferred" },
  {
    value: "handoff_pending",
    labelKey: "aiSupervision.filters.handoffPending"
  },
  { value: "human_handling", labelKey: "aiSupervision.filters.humanHandling" },
  { value: "ai_paused", labelKey: "aiSupervision.filters.aiPaused" },
  { value: "closed", labelKey: "aiSupervision.filters.closed" }
];
