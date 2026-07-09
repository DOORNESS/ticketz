export const AI_HANDOFF_REASONS = {
  customer_requested_human: "customer_requested_human",
  low_confidence: "low_confidence",
  sensitive_subject: "sensitive_subject",
  no_knowledge_found: "no_knowledge_found",
  provider_error: "provider_error",
  manual_takeover: "manual_takeover"
} as const;

export type AiHandoffReason =
  (typeof AI_HANDOFF_REASONS)[keyof typeof AI_HANDOFF_REASONS];

export const AI_HANDOFF_REASON_LABELS: Record<AiHandoffReason, string> = {
  customer_requested_human: "Cliente pediu atendente",
  low_confidence: "Baixa confiança da IA",
  sensitive_subject: "Assunto sensível",
  no_knowledge_found: "Informação não encontrada na base",
  provider_error: "Erro do provedor de IA",
  manual_takeover: "Atendente assumiu manualmente"
};

export const AI_OPERATIONAL_EVENTS = {
  ai_started: "ai_started",
  ai_responded: "ai_responded",
  ai_resolved: "ai_resolved",
  ai_transferred: "ai_transferred",
  ai_paused: "ai_paused",
  ai_resumed: "ai_resumed",
  human_assumed: "human_assumed",
  ticket_queued: "ticket_queued",
  ticket_queue_changed: "ticket_queue_changed",
  ticket_closed_by_ai: "ticket_closed_by_ai",
  ticket_closed_by_human: "ticket_closed_by_human",
  sla_breached: "sla_breached",
  sla_reminder_30s: "sla_reminder_30s",
  sla_reminder_60s: "sla_reminder_60s",
  sla_supervisor_escalation: "sla_supervisor_escalation"
} as const;

export type AiOperationalEvent =
  (typeof AI_OPERATIONAL_EVENTS)[keyof typeof AI_OPERATIONAL_EVENTS];

export const AI_OPERATIONAL_EVENT_LABELS: Record<AiOperationalEvent, string> = {
  ai_started: "IA iniciou atendimento",
  ai_responded: "IA respondeu",
  ai_resolved: "IA resolveu",
  ai_transferred: "IA transferiu",
  ai_paused: "IA pausada",
  ai_resumed: "IA retomada",
  human_assumed: "Humano assumiu",
  ticket_queued: "Ticket entrou na fila",
  ticket_queue_changed: "Ticket mudou de fila",
  ticket_closed_by_ai: "Ticket encerrado pela IA",
  ticket_closed_by_human: "Ticket encerrado pelo humano",
  sla_breached: "SLA expirado",
  sla_reminder_30s: "Alerta SLA 30 segundos",
  sla_reminder_60s: "Alerta SLA 1 minuto",
  sla_supervisor_escalation: "Escalação para supervisor"
};

export const AI_TICKET_FILTERS = {
  all: "all",
  ai_handling: "ai_handling",
  ai_resolved: "ai_resolved",
  ai_transferred: "ai_transferred",
  handoff_pending: "handoff_pending",
  human_handling: "human_handling",
  ai_paused: "ai_paused",
  closed: "closed"
} as const;

export type AiTicketFilter =
  (typeof AI_TICKET_FILTERS)[keyof typeof AI_TICKET_FILTERS];

export const getHandoffReasonLabel = (
  reason?: string | null
): string | null => {
  if (!reason) {
    return null;
  }

  return AI_HANDOFF_REASON_LABELS[reason as AiHandoffReason] || reason;
};
