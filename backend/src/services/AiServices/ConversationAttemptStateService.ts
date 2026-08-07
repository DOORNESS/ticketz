/**
 * Estado de tentativa da conversa.
 *
 * O histórico bruto é enviado ao modelo, mas "o cliente já tentou o passo X e
 * falhou" é um fato que se perde no meio das mensagens: o modelo relê a última
 * frase, reconhece o tema ("senha") e reoferece o mesmo primeiro passo. O
 * resultado é o robô mandando o cliente de volta para o mesmo formulário que
 * ele acabou de dizer que não funcionou.
 *
 * Este módulo transforma esse fato implícito em um bloco explícito do prompt:
 * quais passos o assistente já ofereceu e se o cliente relatou falha. É
 * deterministico, testável sem LLM e independente de marca ou procedimento —
 * vale para recuperação de senha, saldo, segunda via ou qualquer sequência
 * oficial de solução.
 *
 * O que ele NÃO faz: decidir qual é o próximo passo. Isso continua sendo do
 * material recuperado pelo RAG e do modelo. Aqui só se estabelece o que já
 * está descartado.
 */

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type OfferedStep = {
  url?: string;
  summary: string;
};

export type ConversationAttemptState = {
  offeredSteps: OfferedStep[];
  reportedFailure: boolean;
  failureQuote?: string;
  promptBlock: string;
};

const normalize = (value: string): string =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Sinais de que o cliente executou algo e não chegou ao resultado.
 *
 * Cobre as três formas em que isso aparece no WhatsApp: relato de tentativa
 * ("ja tentei"), ausência de resultado ("nao chegou o codigo") e perda de
 * pré-requisito ("nao tenho mais acesso ao email"). A terceira importa porque
 * invalida o passo padrão mesmo sem o cliente ter tentado.
 */
const FAILURE_PATTERNS: RegExp[] = [
  // Tentativa explícita que não deu certo
  /\bja\s+(?:tentei|tentamos|fiz|fizemos|cliquei|acessei|entrei|preenchi|solicitei)\b/,
  /\btentei\b(?![^.!?]*\bvou\b)/,
  /\bfiz\s+(?:isso|iss[uo]|o\s+que\s+voce\s+(?:disse|falou|pediu))\b/,
  /\bnao\s+(?:deu\s+certo|funcionou|funciona|rolou|adiantou|resolveu)\b/,
  /\bsem\s+sucesso\b/,
  /\bcontinua\s+(?:igual|a\s+mesma\s+coisa|sem|do\s+mesmo\s+jeito)\b/,
  /\bnada\s+(?:aconteceu|mudou|acontece)\b/,

  // Resultado esperado não chegou
  /\bn(?:ao|)\s*(?:chegou|recebi|veio|recebo|chega)\b/,
  /\bnao\s+recebi\b/,
  /\bnao\s+chegaram?\b/,
  /\bnao\s+apareceu\b/,

  // Pré-requisito perdido — invalida o caminho padrão
  /\bperdi\s+(?:meu|o|a|minha)?\s*(?:e-?mail|email|acesso|numero|chip|telefone|celular|senha\s+e\s+o\s+e-?mail)\b/,
  /\bnao\s+tenho\s+mais\s+(?:acesso|o|a)\b/,
  /\bnao\s+tenho\s+acesso\b/,
  /\b(?:troquei|mudei)\s+(?:de\s+|meu\s+|o\s+|a\s+|minha\s+)*(?:numero|telefone|celular|chip|e-?mail|email)\b/,
  /\bnao\s+lembro\s+(?:qual|o)\s+(?:e-?mail|email)\b/,
  /\be-?mail\s+(?:foi\s+|esta\s+|ta\s+)?(?:antigo|desativado|hackeado|invadido|bloqueado|nao\s+existe)\b/,

  // Falha genérica ao executar
  /\bnao\s+consegui\b/,
  /\bda(?:va|)\s+erro\b/,
  /\bdeu\s+erro\b/
];

/** Frases que parecem falha mas são o cliente pedindo para tentar. */
const FUTURE_INTENT_PATTERNS: RegExp[] = [
  /\bvou\s+tentar\b/,
  /\bposso\s+tentar\b/,
  /\bquero\s+tentar\b/,
  /\bcomo\s+(?:eu\s+)?(?:tento|faco\s+para\s+tentar)\b/
];

export const detectCustomerFailureReport = (text: string): boolean => {
  const normalized = normalize(text);
  if (!normalized.trim()) {
    return false;
  }

  if (FUTURE_INTENT_PATTERNS.some(pattern => pattern.test(normalized))) {
    return false;
  }

  return FAILURE_PATTERNS.some(pattern => pattern.test(normalized));
};

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;

const stripTrailingPunctuation = (url: string): string =>
  url.replace(/[.,;:!?)]+$/, "");

/** Frase em que a URL aparece — dá ao modelo o rótulo do passo, não só o link. */
const summarizeStepAround = (body: string, url: string): string => {
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.trim())
    .filter(Boolean);

  const withUrl = sentences.find(sentence => sentence.includes(url));
  const summary = (withUrl || sentences[0] || "").replace(/\s+/g, " ").trim();
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
};

/**
 * Passos concretos que o assistente já ofereceu, do mais recente para o mais
 * antigo. Um passo só conta quando carrega um link — é o que o cliente
 * consegue de fato repetir por engano, e o que não pode ser reoferecido.
 */
export const extractAssistantOfferedSteps = (
  history: ConversationTurn[]
): OfferedStep[] => {
  const steps: OfferedStep[] = [];
  const seen = new Set<string>();

  [...history]
    .reverse()
    .filter(turn => turn.role === "assistant")
    .forEach(turn => {
      const body = turn.content || "";
      const urls = body.match(URL_PATTERN) || [];

      urls.forEach(rawUrl => {
        const url = stripTrailingPunctuation(rawUrl);
        if (seen.has(url)) {
          return;
        }
        seen.add(url);
        steps.push({ url, summary: summarizeStepAround(body, rawUrl) });
      });
    });

  return steps;
};

const buildPromptBlock = ({
  offeredSteps,
  reportedFailure,
  failureQuote
}: Omit<ConversationAttemptState, "promptBlock">): string => {
  if (!reportedFailure) {
    return "";
  }

  const lines = ["Estado desta conversa (derivado das mensagens anteriores):"];

  if (failureQuote) {
    lines.push(
      `- O cliente informou que já passou por essa etapa e ela NÃO resolveu: "${failureQuote}".`
    );
  } else {
    lines.push(
      "- O cliente informou que já tentou o caminho indicado e ele NÃO resolveu."
    );
  }

  if (offeredSteps.length) {
    lines.push("- Passos já oferecidos nesta conversa (não repetir):");
    offeredSteps.slice(0, 3).forEach(step => {
      lines.push(`  · ${step.url}${step.summary ? ` — ${step.summary}` : ""}`);
    });
  }

  lines.push(
    "Trate esses passos como descartados. NÃO reenvie os mesmos links nem peça para refazer a mesma ação.",
    "Procure no material recuperado a etapa seguinte do procedimento (a alternativa para quem já tentou o caminho padrão ou perdeu o acesso exigido por ele) e conduza o cliente diretamente para ela.",
    "Se o material não trouxer uma etapa seguinte, diga com franqueza que esse caminho não resolve o caso dele e faça UMA pergunta objetiva; nunca repita a etapa que falhou."
  );

  return lines.join("\n");
};

export const buildConversationAttemptState = (
  history: ConversationTurn[],
  currentUserText: string
): ConversationAttemptState => {
  const reportedFailure = detectCustomerFailureReport(currentUserText);
  const offeredSteps = extractAssistantOfferedSteps(history);
  const failureQuote = reportedFailure
    ? (currentUserText || "").replace(/\s+/g, " ").trim().slice(0, 160)
    : undefined;

  const state = { offeredSteps, reportedFailure, failureQuote };

  return { ...state, promptBlock: buildPromptBlock(state) };
};
