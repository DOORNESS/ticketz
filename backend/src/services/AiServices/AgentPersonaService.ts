import AiAgent from "../../models/AiAgent";
import Brand from "../../models/Brand";
import { logger } from "../../utils/logger";
import { buildTimeBasedGreeting } from "./Triage/CaseCompletenessEngine";
import {
  buildNivelIdentityReply,
  NIVEL_ASSISTANT_SELF_DESCRIPTION
} from "./NivelAssistantPolicy";
import {
  buildBrandExternalSupportReply,
  buildBrandIdentityReply,
  buildBrandInformationalFallback,
  buildBrandOperationalRules
} from "../BrandServices/BrandPersonaService";

/**
 * Camada de compatibilidade durante a migração para multimarca.
 *
 * Quando a Brand do ticket chega, ela manda: persona, fallback, contatos e
 * regras saem do registro. Sem Brand (ticket legado, antes do backfill), o
 * caminho antigo por `detectAgentBrand` permanece.
 *
 * Estas funções `*ForBrand` são as que código novo deve chamar. As versões
 * sem Brand ficam até o log de fallback parar de aparecer.
 */
export const resolveIdentityReplyForBrand = (
  brand: Brand | null | undefined,
  agent?: Partial<Pick<AiAgent, "name" | "basePrompt">> | null
): string => buildBrandIdentityReply(brand) || buildAgentIdentityReply(agent);

export const resolveInformationalFallbackForBrand = (
  brand: Brand | null | undefined,
  agent?: Partial<Pick<AiAgent, "name" | "basePrompt">> | null,
  userText = ""
): string =>
  buildBrandInformationalFallback(brand) ||
  resolveAgentInformationalFallback(agent, userText);

export const resolveExternalSupportReplyForBrand = (
  brand: Brand | null | undefined,
  agent?: Partial<Pick<AiAgent, "name" | "basePrompt">> | null,
  userText = ""
): string | null =>
  buildBrandExternalSupportReply(brand) ||
  resolveAgentExternalSupportReply(agent, userText);

export const resolveOperationalRulesForBrand = (
  brand: Brand | null | undefined,
  agent?: Partial<Pick<AiAgent, "name" | "basePrompt">> | null
): string =>
  buildBrandOperationalRules(brand) || buildAgentOperationalRules(agent);

/**
 * Um aviso por agente, não um por mensagem: o objetivo é revelar agente sem
 * `brandId`, e repetir isso a cada turno só afogaria o log.
 */
const legacyBrandWarned = new Set<string>();

const reportLegacyAgentBrand = (
  agent: { name?: string | null } | null | undefined,
  slug: string
): string => {
  const key = `${agent?.name || "?"}:${slug}`;
  if (!legacyBrandWarned.has(key)) {
    legacyBrandWarned.add(key);
    logger.warn(
      { agentName: agent?.name || null, slug },
      "legacyAgentBrandFallback: agente sem brandId — marca inferida por texto"
    );
  }
  return slug;
};

/**
 * Slug da marca. Deixou de ser união fechada quando marcas passaram a ser
 * registro: uma marca nova criada no painel devolve o slug dela aqui, sem
 * alteração de código.
 */
export type AgentBrand = string;

/** WhatsApp oficial para handoff humano da Nível Cashback. */
export const NIVEL_HUMAN_SUPPORT_WHATSAPP = "17 99165-8811";

export const buildNivelHumanSupportReply = (): string =>
  `Entendi. Para falar com um atendente humano, entre em contato pelo WhatsApp ${NIVEL_HUMAN_SUPPORT_WHATSAPP}.`;

type AgentPersonaHint = Pick<AiAgent, "name" | "basePrompt"> & {
  brand?: { slug?: string | null } | null;
};

/**
 * Marca do agente.
 *
 * O vínculo estrutural (`AiAgent.brand`) é a resposta. O casamento por texto
 * abaixo é só transição, para agente que ainda não passou pelo backfill — e
 * está instrumentado justamente para provar, em log, quando ainda acontece.
 * Depois do backfill esse trecho não executa: nenhuma decisão de runtime
 * depende de substring de nome ou de prompt.
 */
export const detectAgentBrand = (
  agent?: Partial<AgentPersonaHint> | null
): AgentBrand => {
  const linked = agent?.brand?.slug?.trim();
  if (linked) {
    return linked;
  }

  const text = `${agent?.name || ""} ${agent?.basePrompt || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    text.includes("nivelton") ||
    text.includes("nivel cashback") ||
    text.includes("agente nivel")
  ) {
    return reportLegacyAgentBrand(agent, "nivel");
  }

  if (
    text.includes("webin") ||
    text.includes("fortmax") ||
    text.includes("webg3") ||
    text.includes("fortcontrol")
  ) {
    return reportLegacyAgentBrand(agent, "fortmax");
  }

  return "generic";
};

export const buildAgentIdentityReply = (
  agent?: Partial<AgentPersonaHint> | null
): string => {
  // A Nível não usa nome de pessoa. O agente continua se chamando o que se
  // chama no painel; o que muda é o que chega ao cliente. Precisa vir antes
  // de qualquer leitura do prompt, porque o prompt gravado em produção ainda
  // carrega o nome antigo.
  if (detectAgentBrand(agent) === "nivel") {
    return buildNivelIdentityReply();
  }

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

/**
 * Saudação de abertura: curta, direta e sem apresentar o agente.
 *
 * O nome do assistente sai só quando o cliente pergunta
 * (`detectAgentIdentityQuestion` → `buildAgentIdentityReply`); abrir com
 * "Me chamo X" a cada conversa deixava o robô prolixo e não podia ser
 * removido pelo prompt, porque o texto era montado aqui.
 */
export const buildAgentGreetingReply = ({
  alreadyGreeted,
  customerName
}: {
  agent?: AgentPersonaHint | null;
  alreadyGreeted: boolean;
  customerName?: string | null;
}): string => {
  if (alreadyGreeted) {
    return "Em que posso ajudar?";
  }

  return `${buildTimeBasedGreeting("America/Sao_Paulo", customerName)} Em que posso ajudar?`;
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
    return buildNivelHumanSupportReply();
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
Você não tem nome próprio. Nunca diga "me chamo", nunca invente ou repita nome de pessoa para si: você é o ${NIVEL_ASSISTANT_SELF_DESCRIPTION}. Só se apresente se perguntarem quem é você — nunca no meio ou no fim de uma conversa já em andamento, e nunca em resposta a "ok" ou "obrigado".
Quando o contexto for Nível Cashback, "Nível" é o nome da empresa/produto, nunca medida, grau ou posição hierárquica.
Nunca dê conselho genérico de marketing, redes sociais, e-mail marketing, parcerias, boca a boca ou divulgação que não esteja nos materiais recuperados. Se não houver procedimento da Nível para o que foi pedido, diga isso e ofereça o caminho real — não preencha a resposta com dicas genéricas de internet.
Não descreva telas, botões ou fluxos do aplicativo que não estejam nos materiais recuperados. Se não souber onde fica algo, pergunte ou encaminhe; não invente o caminho.

Estabelecimento físico e grandes marcas funcionam de formas diferentes, e a diferença importa:
- Estabelecimento físico é comércio local credenciado (loja, restaurante, prestador de serviço). Ele se credencia falando com a equipe da Nível, trabalha com saldo próprio dentro da plataforma e, na hora da compra, informa a bonificação: o cashback cai direto e na hora na conta do cliente. A partir daí o valor é do cliente, dentro das regras da plataforma, sem depender de pagamento futuro do estabelecimento.
- Grandes marcas e lojas online têm parceria comercial específica. Produtos, ofertas e campanhas entram na plataforma por contrato, e o cashback pode depender da confirmação da compra e do prazo de pagamento acordado.
Nunca troque um modelo pelo outro nem prometa cashback imediato para compra em grande marca.

Quem quiser credenciar o próprio estabelecimento, ou atuar como executivo, representante ou franqueado, é atendido pela equipe comercial — não pelo aplicativo. Antes de encaminhar, confirme com o próprio cliente qual é o caso: consumidor final, empresa dele, ou divulgação da Nível. Nunca ofereça o contato comercial para quem é consumidor final nem para quem ainda não disse a que veio.
Perguntas como "o que é o Nível?" ou "como funciona o Nível?" referem-se ao produto Nível Cashback.
Em qualquer conversa sobre esquecer, trocar, redefinir ou recuperar senha/conta, use exclusivamente o procedimento e os links oficiais do material "Recuperar conta e senha". Envie o link de recuperação relevante uma única vez e explique as opções disponíveis na própria página.
Nunca use uma URL terminada em "/chamado" para senha, recuperação de conta ou problema de acesso; siga os links específicos recuperados da base.
Quando o cliente pedir atendimento humano, falar com uma pessoa ou transferência para atendente, informe exclusivamente o WhatsApp ${NIVEL_HUMAN_SUPPORT_WHATSAPP}. Não encaminhe para https://nivelvelo.com/chamado nesses casos.
Quando a base indicar formulário ou chamado externo para outros assuntos (não pedido de humano), nunca afirme que transferiu o atendimento dentro do WhatsApp.
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
