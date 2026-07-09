export const AI_PRIORITY_LEVELS = {
  low: "low",
  medium: "medium",
  high: "high",
  urgent: "urgent"
} as const;

export type AiPriorityLevel =
  (typeof AI_PRIORITY_LEVELS)[keyof typeof AI_PRIORITY_LEVELS];

export const AI_PRIORITY_LABELS: Record<AiPriorityLevel, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente"
};

export const AI_PRIORITY_COLORS: Record<AiPriorityLevel, string> = {
  low: "#4caf50",
  medium: "#ff9800",
  high: "#f44336",
  urgent: "#b71c1c"
};

const RISK_KEYWORDS: Record<AiPriorityLevel, string[]> = {
  urgent: [
    "sistema fora",
    "fora do ar",
    "não consigo acessar",
    "parado",
    "urgente",
    "emergência",
    "processo parado",
    "bloqueado"
  ],
  high: [
    "cancelar",
    "reembolso",
    "cobrança indevida",
    "não funciona",
    "erro crítico",
    "prejuízo",
    "irritado",
    "absurdo",
    "procon"
  ],
  medium: [
    "boleto",
    "segunda via",
    "financeiro",
    "contrato",
    "atraso",
    "problema",
    "ajuda"
  ],
  low: ["dúvida", "informação", "como funciona", "horário", "preço"]
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const classifyTicketPriority = (text: string): AiPriorityLevel => {
  const normalized = normalize(text || "");

  const levels: AiPriorityLevel[] = ["urgent", "high", "medium", "low"];
  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i];
    const keywords = RISK_KEYWORDS[level];
    for (let j = 0; j < keywords.length; j += 1) {
      if (normalized.includes(keywords[j])) {
        return level;
      }
    }
  }

  return AI_PRIORITY_LEVELS.medium;
};

export const getPriorityLabel = (priority?: string | null): string | null => {
  if (!priority) {
    return null;
  }

  return AI_PRIORITY_LABELS[priority as AiPriorityLevel] || priority;
};
