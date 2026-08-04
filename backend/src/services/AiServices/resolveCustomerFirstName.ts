type ContactNameHint = {
  name?: string | null;
  number?: string | null;
};

const EMOJI_AND_SYMBOLS =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu;

const onlyDigits = (value: string): string => value.replace(/\D+/g, "");

const titleCaseToken = (token: string): string => {
  const lower = token.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
};

/**
 * Primeiro nome do cliente para uso na saudação.
 *
 * O Ticketz preenche `Contact.name` com o pushName do WhatsApp, mas cai para o
 * próprio número quando o contato não publica nome. Devolve `null` sempre que
 * não houver um nome de gente utilizável — a saudação então omite o nome em vez
 * de cumprimentar o cliente pelo telefone dele.
 */
export const resolveCustomerFirstName = (
  contact?: ContactNameHint | null
): string | null => {
  const raw = (contact?.name || "").replace(EMOJI_AND_SYMBOLS, "").trim();
  if (!raw) {
    return null;
  }

  const digits = onlyDigits(raw);
  const numberDigits = onlyDigits(contact?.number || "");

  // Nome que é o próprio telefone (com ou sem máscara) não serve como saudação.
  if (digits && (digits === numberDigits || digits.length >= 8)) {
    return null;
  }

  const first = raw
    .split(/[\s,]+/)
    .map(token => token.replace(/[^\p{L}\p{M}'-]/gu, ""))
    .find(token => token.length >= 2);

  if (!first) {
    return null;
  }

  // Nomes gravados em caixa alta ficam agressivos numa saudação.
  const normalized =
    first === first.toLocaleUpperCase("pt-BR") ? titleCaseToken(first) : first;

  return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
};
