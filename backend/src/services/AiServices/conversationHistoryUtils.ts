export type ConversationHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

const normalizeForCompare = (value: string): string =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Remove do histórico a repetição da mensagem que está sendo respondida.
 *
 * `wbotMessageListener` persiste a mensagem do cliente (`verifyMessage`) antes
 * de acionar a IA, então ela já volta em `Message.findAll`. Como os dois
 * caminhos de resposta anexam `{ role: "user", content: userText }` no fim do
 * array, o modelo recebia o mesmo turno duas vezes seguidas — ruído de atenção
 * bem no ponto que mais pesa na resposta.
 *
 * Quando o debounce agrupa várias mensagens, `userText` é o texto concatenado;
 * nesse caso as partes individuais também são retiradas do fim do histórico,
 * para o turno atual aparecer uma vez só e já unificado.
 */
export const dropDuplicatedCurrentTurn = (
  history: ConversationHistoryTurn[],
  currentUserText: string
): ConversationHistoryTurn[] => {
  const current = normalizeForCompare(currentUserText);
  if (!current) {
    return history;
  }

  const result = [...history];

  while (result.length) {
    const last = result[result.length - 1];
    if (last.role !== "user") {
      break;
    }

    const lastContent = normalizeForCompare(last.content);
    if (!lastContent) {
      result.pop();
      continue;
    }

    // Turno idêntico, ou parte de um turno agrupado pelo debounce.
    if (lastContent === current || current.includes(lastContent)) {
      result.pop();
      continue;
    }

    break;
  }

  return result;
};
