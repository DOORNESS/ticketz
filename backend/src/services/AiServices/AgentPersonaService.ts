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
  agent?: Partial<AgentPersonaHint> | null,
  userText = ""
): string => {
  const brand = detectAgentBrand(agent);
  if (brand === "nivel") {
    const normalized = userText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (/senha|login|acesso|recuper|conta|cpf/.test(normalized)) {
      return "Não encontrei agora o link oficial de recuperação na base e não vou improvisar um endereço. Você ainda tem acesso ao e-mail ou telefone cadastrado? Com essa informação, tento localizar o procedimento correto.";
    }

    return "Não encontrei uma orientação segura para esse caso nos materiais disponíveis. Para que a equipe analise sua solicitação sem eu arriscar uma informação incorreta, abra um chamado em https://nivelvelo.com/chamado e descreva o que aconteceu.";
  }

  if (brand === "fortmax") {
    const normalized = userText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const financeOrManagement =
      /boleto|financeir|fatura|cobranca|pagamento|gerencia|contrato/.test(
        normalized
      );

    return financeOrManagement
      ? "Não encontrei esse procedimento com segurança na base. A Cristiane pode orientar você sobre financeiro e gerência pelo WhatsApp 17 99605-8041."
      : "Não encontrei esse procedimento com segurança na base. O Thiago pode orientar você no suporte pelo WhatsApp 17 98833-8760. Para assuntos financeiros ou de gerência, fale com a Cristiane no 17 99605-8041.";
  }

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
  agent?: Partial<AgentPersonaHint> | null,
  userText = ""
): string | null => {
  const brand = detectAgentBrand(agent);
  if (brand === "nivel") {
    return "Para continuar com uma pessoa da equipe, abra um chamado em https://nivelvelo.com/chamado. Descreva o que aconteceu e anexe os comprovantes necessários diretamente no formulário.";
  }

  if (brand === "fortmax") {
    return resolveAgentInformationalFallback(agent, userText);
  }

  return null;
};

export const buildAgentOperationalRules = (
  agent?: Partial<AgentPersonaHint> | null
): string => {
  const brand = detectAgentBrand(agent);

  if (brand === "nivel") {
    return `
Quando o contexto for Nível Cashback, "Nível" é o nome da empresa/produto, nunca medida, grau ou posição hierárquica.
Perguntas como "o que é o Nível?" ou "como funciona o Nível?" referem-se ao produto Nível Cashback.
Em qualquer conversa sobre esquecer, trocar, redefinir ou recuperar senha/conta, use exclusivamente o procedimento e os links oficiais do material "Recuperar conta e senha". Envie o link de recuperação relevante uma única vez e explique as opções disponíveis na própria página.
Nunca use uma URL terminada em "/chamado" para senha, recuperação de conta ou problema de acesso; siga os links específicos recuperados da base.
Nunca informe telefone ou WhatsApp. Conduza o procedimento somente com as orientações e links presentes no contexto.
Quando a base indicar formulário ou chamado externo, nunca afirme que transferiu o atendimento dentro do WhatsApp.
Se os materiais recuperados não trouxerem um procedimento seguro para concluir o caso, encaminhe naturalmente para https://nivelvelo.com/chamado. Não sugira demonstração, agendamento ou contato futuro sem fornecer o procedimento real disponível.
`.trim();
  }

  if (brand === "fortmax") {
    return `
Atue exclusivamente como assistente da Fortmax e de seus produtos presentes na base deste canal.
Não atribua à Fortmax informações, contatos, políticas ou funcionalidades da Nível Cashback.
Nunca invente portal do cliente, link, procedimento ou funcionalidade ausente da base.
Quando faltar uma orientação segura, ofereça uma saída concreta e cordial: Thiago atende suporte no WhatsApp 17 98833-8760; Cristiane atende gerência e financeiro no WhatsApp 17 99605-8041.
`.trim();
  }

  return `
Não presuma marca, produto, telefone ou política que não esteja no prompt do agente ou na base recuperada.
`.trim();
};

export const resolveSupportPhoneForAgent = (
  _agent?: Partial<AgentPersonaHint> | null
): string | null => null;
