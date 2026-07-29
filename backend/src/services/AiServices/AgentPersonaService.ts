import AiAgent from "../../models/AiAgent";
import { buildTimeBasedGreeting } from "./Triage/CaseCompletenessEngine";

export type AgentBrand = "nivel" | "fortmax" | "generic";

type AgentPersonaHint = Pick<AiAgent, "name" | "basePrompt">;

export const detectAgentBrand = (
  agent?: Partial<AgentPersonaHint> | null
): AgentBrand => {
  const text = `${agent?.name || ""} ${agent?.basePrompt || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    text.includes("nivelton") ||
    text.includes("nivel cashback") ||
    text.includes("agente nivel")
  ) {
    return "nivel";
  }

  if (
    text.includes("webin") ||
    text.includes("fortmax") ||
    text.includes("webg3") ||
    text.includes("fortcontrol")
  ) {
    return "fortmax";
  }

  return "generic";
};

export const buildAgentIdentityReply = (
  agent?: Partial<AgentPersonaHint> | null
): string => {
  const prompt = agent?.basePrompt?.trim() || "";
  const quoted = prompt.match(/"([^"]+)"/);
  if (quoted?.[1]?.trim()) {
    const reply = quoted[1].trim();
    return reply.endsWith(".") ? reply : `${reply}.`;
  }

  const personaMatch = prompt.match(/(?:Você é o|Você é a)\s+([^,\n.]+)/i);
  if (personaMatch?.[1]?.trim()) {
    return `Me chamo ${personaMatch[1].trim()}.`;
  }

  if (agent?.name?.trim()) {
    return `Me chamo ${agent.name.trim()}.`;
  }

  return "Sou o assistente virtual deste canal.";
};

export const buildAgentGreetingReply = ({
  agent,
  alreadyGreeted
}: {
  agent: AgentPersonaHint;
  alreadyGreeted: boolean;
}): string => {
  const salutation = buildTimeBasedGreeting();

  if (alreadyGreeted) {
    return `${salutation} Qual é sua dúvida? Vou ajudar com base nos materiais deste canal.`;
  }

  return `${buildAgentIdentityReply(agent)} ${salutation} Como posso ajudar você hoje?`;
};

export const resolveAgentInformationalFallback = (
  agent?: Partial<AgentPersonaHint> | null
): string => {
  const identity = buildAgentIdentityReply(agent);
  return `${identity} Não encontrei um trecho seguro da base para responder com precisão. Pode detalhar um pouco mais sua dúvida?`;
};

export const resolveAgentGenericFallback = (
  agent?: Partial<AgentPersonaHint> | null
): string => {
  const name = agent?.name?.trim();
  return name
    ? `Sou ${name}. Entendi sua mensagem; pode me contar um pouco mais do que você precisa?`
    : "Entendi sua mensagem. Pode me contar um pouco mais do que você precisa?";
};

export const resolveAgentExternalSupportReply = (
  agent?: Partial<AgentPersonaHint> | null
): string | null => {
  if (detectAgentBrand(agent) !== "nivel") {
    return null;
  }

  return "Para uma análise individual da sua solicitação, abra um chamado no canal oficial: https://nivelvelo.com/chamado. Descreva o ocorrido e anexe os comprovantes necessários diretamente no formulário. Por este atendimento, esse é o procedimento disponível para a continuidade da sua solicitação.";
};

export const buildAgentOperationalRules = (
  agent?: Partial<AgentPersonaHint> | null
): string => {
  const brand = detectAgentBrand(agent);

  if (brand === "nivel") {
    return `
Quando o contexto for Nível Cashback, "Nível" é o nome da empresa/produto, nunca medida, grau ou posição hierárquica.
Perguntas como "o que é o Nível?" ou "como funciona o Nível?" referem-se ao produto Nível Cashback.
Em qualquer conversa sobre esquecer, trocar, redefinir ou recuperar senha/conta, use exclusivamente o procedimento e o link do material "Recuperar conta e senha". Envie o link de recuperação uma única vez e explique as opções disponíveis na própria página.
Nunca use uma URL terminada em "/chamado" para senha, recuperação de conta ou problema de acesso; siga os links específicos recuperados da base.
Nunca informe telefone ou WhatsApp. Conduza o procedimento somente com as orientações e links presentes no contexto.
Quando a base indicar formulário ou chamado externo, nunca afirme que transferiu o atendimento dentro do WhatsApp.
`.trim();
  }

  if (brand === "fortmax") {
    return `
Atue exclusivamente como assistente da Fortmax e de seus produtos presentes na base deste canal.
Não atribua à Fortmax informações, contatos, políticas ou funcionalidades da Nível Cashback.
`.trim();
  }

  return `
Não presuma marca, produto, telefone ou política que não esteja no prompt do agente ou na base recuperada.
`.trim();
};

export const resolveSupportPhoneForAgent = (
  _agent?: Partial<AgentPersonaHint> | null
): string | null => null;
