const PROACTIVE_HANDOFF_PATTERNS = [
  /aguard(?:ar|e)\s+(?:o\s+)?atendimento\s+humano/gi,
  /atendimento\s+humano,?\s*(?:que\s+est[aá]\s+)?dispon[ií]vel/gi,
  /entrar\s+em\s+contato\s+com\s+o\s+suporte\s+via\s+whatsapp(?:\s+ou\s+aguard(?:ar|e))?/gi,
  /posso\s+transferir\s+(?:voc[eê]\s+)?para\s+(?:um\s+)?atendente/gi,
  /vou\s+(?:encaminhar|transferir)\s+(?:voc[eê]\s+)?para/gi,
  /se\s+precisar\s+de\s+mais\s+ajuda[^.!?]*(?:atendimento\s+humano|aguard(?:ar|e))/gi
];

const INTERNAL_KNOWLEDGE_LEAK_PATTERNS = [
  /#\s*O que o rob[oô]/i,
  /rob[oô]\s+nunca\s+deve/i,
  /nunca\s+orientar\s+o\s+cliente/i,
  /nunca\s+deve\s+fazer/i,
  /regras?\s+internas?/i,
  /instru[cç][oõ]es?\s+(?:internas?|do\s+agente|do\s+rob[oô])/i,
  /prompt\s+do\s+agente/i,
  /Com base no nosso material:/i
];

export const containsProactiveHandoffLanguage = (text: string): boolean =>
  PROACTIVE_HANDOFF_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

export const containsInternalKnowledgeLeak = (text: string): boolean =>
  INTERNAL_KNOWLEDGE_LEAK_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

export const isInternalKnowledgeSection = (text: string): boolean =>
  containsInternalKnowledgeLeak(text);

const stripInternalKnowledgeSections = (text: string): string => {
  const sections = text.split(/\n(?=#{1,3}\s)/);
  const safe = sections.filter(section => !containsInternalKnowledgeLeak(section));
  return safe.join("\n").trim();
};

export const sanitizeAiOutboundText = (
  text: string,
  options: { allowHandoffLanguage?: boolean } = {}
): string => {
  if (!text?.trim()) {
    return text;
  }

  let sanitized = text.trim();

  if (containsInternalKnowledgeLeak(sanitized)) {
    const stripped = stripInternalKnowledgeSections(sanitized);
    if (
      stripped.length >= 20 &&
      !containsInternalKnowledgeLeak(stripped)
    ) {
      sanitized = stripped;
    } else {
      return "";
    }
  }

  if (options.allowHandoffLanguage) {
    return sanitized;
  }

  if (!containsProactiveHandoffLanguage(sanitized)) {
    return sanitized;
  }

  const sentences = sanitized
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !containsProactiveHandoffLanguage(sentence));

  if (sentences.length) {
    return sentences.join(" ").trim();
  }

  return "Entendi. Pode me contar um pouco mais sobre o que aconteceu para eu te ajudar melhor?";
};
