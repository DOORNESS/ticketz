/**
 * Regras puras do recorte da pergunta de confirmação.
 *
 * Sem imports de model, Redis ou fila: é o núcleo de decisão do recurso e
 * precisa ser testável isoladamente e rápido.
 */

/**
 * Contexto em que o recorte está liberado.
 *
 * Começa restrito ao fluxo de recuperação de conta/senha, que é onde a pergunta
 * de confirmação chega antes de o cliente ter tido qualquer chance de executar
 * o passo. Ampliar isso muda a entrega de toda resposta da IA — mexer aqui é
 * decisão de produto, não detalhe de implementação.
 */
const RECOVERY_CONTEXT =
  /recuperar|recupera[cç][aã]o|senha|redefinir|esqueci|acesso [aà] conta|login|conta bloqueada/i;

/** A mensagem precisa ter pedido uma ação concreta antes de cobrar o resultado. */
const ACTIONABLE_STEP =
  /https?:\/\/|\bclique\b|\bacesse\b|\binsira\b|\bdigite\b|\binforme\b|\bpreencha\b|\bselecione\b|\btoque em\b|\babra\b/i;

/**
 * Pergunta fechada sobre o resultado de um passo — é o que faz sentido adiar.
 * "Conseguiu localizar sua conta?" só pode ser respondida depois da tentativa.
 */
const CONFIRMATION_QUESTION =
  /\b(conseguiu|consegue|deu certo|funcionou|apareceu|recebeu|chegou|localizou|encontrou|visualizou|abriu|carregou|foi poss[ií]vel|teve sucesso)\b/i;

/**
 * Pergunta que pede um dado do cliente. Nunca adiar: é ela que destrava o
 * atendimento, e segurá-la por um minuto trava a conversa.
 */
const INFORMATION_REQUEST =
  /^(qual|quais|quando|onde|quem|como|por que|porque|de que forma|me informe|me diga|poderia informar|pode informar)\b/i;

const MIN_INSTRUCTION_LENGTH = 40;
const MAX_QUESTION_LENGTH = 120;

export type SplitResult = {
  immediate: string;
  deferred: string;
};

/**
 * Separa a pergunta de confirmação final do corpo com as instruções.
 * Devolve `null` quando a mensagem deve seguir inteira, que é o caso comum.
 */
export const splitDeferrableConfirmation = (
  body: string
): SplitResult | null => {
  const trimmed = (body || "").trim();
  if (!trimmed.endsWith("?")) {
    return null;
  }

  // Última frase do texto, desde que a própria pergunta seja uma frase só.
  const match = trimmed.match(/^([\s\S]*?)([^.!?\n]*\?)\s*$/);
  const immediate = match?.[1]?.trim() || "";
  const deferred = match?.[2]?.trim() || "";

  if (!immediate || !deferred) {
    return null;
  }

  // Sem instruções suficientes antes, a pergunta é o próprio conteúdo da resposta.
  if (immediate.length < MIN_INSTRUCTION_LENGTH) {
    return null;
  }

  if (!ACTIONABLE_STEP.test(immediate)) {
    return null;
  }

  if (!RECOVERY_CONTEXT.test(immediate)) {
    return null;
  }

  if (INFORMATION_REQUEST.test(deferred)) {
    return null;
  }

  if (!CONFIRMATION_QUESTION.test(deferred)) {
    return null;
  }

  // Uma pergunta longa costuma carregar instrução junto; não vale recortar.
  if (deferred.length > MAX_QUESTION_LENGTH) {
    return null;
  }

  return { immediate, deferred };
};
