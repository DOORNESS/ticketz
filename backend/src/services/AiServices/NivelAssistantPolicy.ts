/**
 * Política de atendimento da Nível Cashback.
 *
 * Três decisões que o modelo estava errando sozinho e que passam a ser código:
 *
 * 1. **Identidade sem nome próprio.** O assistente se apresenta como
 *    "assistente virtual", nunca com nome de pessoa. O nome do agente continua
 *    existindo como entidade operacional no painel — o que muda é o que chega
 *    ao cliente. Como a base de produção ainda guarda `basePrompt` com o nome
 *    antigo, não basta trocar a semente: existe um saneador de saída.
 *
 * 2. **E-mail não confirmado.** A tela de login mostra "E-mail ainda não
 *    confirmado" com a ação **enviar novamente** ao lado. O assistente mandava
 *    recuperar senha, que não resolve — a conta não está sem senha, está sem
 *    confirmação. A orientação correta é clicar em "enviar novamente".
 *
 * 3. **Qualificação antes de liberar contato executivo.** Quem chega dizendo
 *    "quero saber mais da Nível" pode ser consumidor final, dono de empresa
 *    querendo credenciar o próprio estabelecimento, ou alguém querendo divulgar
 *    a Nível (executivo/franqueado). O contato do representante executivo só
 *    sai nos dois últimos casos, e só quando o próprio cliente comprovou qual
 *    é — na dúvida, pergunta.
 */

/** Representante executivo da Nível. Mesmo número do suporte humano da marca. */
export const NIVEL_EXECUTIVE_CONTACT = Object.freeze({
  name: "Fernando Tarin",
  role: "representante executivo",
  whatsapp: "17 99165-8811"
});

export const NIVEL_ASSISTANT_SELF_DESCRIPTION =
  "assistente virtual da Nível Cashback";

const normalize = (text: string): string =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/* ------------------------------------------------------------------ *
 * 1. Identidade sem nome próprio
 * ------------------------------------------------------------------ */

export const buildNivelIdentityReply = (): string =>
  `Sou o ${NIVEL_ASSISTANT_SELF_DESCRIPTION}. Em que posso ajudar?`;

/**
 * Remove a auto-apresentação com nome próprio do texto que vai ao cliente.
 *
 * Existe porque o `basePrompt` gravado no banco de produção ainda diz o nome:
 * trocar a semente corrige instalação nova, não a que já está rodando. Aqui a
 * regra vale independentemente do que o modelo devolveu.
 *
 * Só mexe em auto-apresentação. "Nível" (a marca) nunca é tocada — o que sai
 * é o nome de pessoa do assistente.
 */
export const stripAssistantProperName = (
  text: string,
  assistantName?: string | null
): string => {
  if (!text?.trim()) {
    return text;
  }

  const names = [assistantName?.trim(), "Nivelton", "Nívelton"]
    .filter((name): name is string => !!name && name.length > 2)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (!names.length) {
    return text;
  }

  const alternation = names.join("|");
  let output = text;

  // "Me chamo X, assistente da Nível Cashback." → "Sou o assistente virtual…"
  output = output.replace(
    new RegExp(
      `\\b(?:me chamo|meu nome (?:é|e)|eu sou o|eu sou a|sou o|sou a)\\s+(?:${alternation})\\b[,:]?\\s*`,
      "gi"
    ),
    `Sou o ${NIVEL_ASSISTANT_SELF_DESCRIPTION}, `
  );

  // "X, assistente da Nível Cashback" no início da frase.
  output = output.replace(
    new RegExp(`\\b(?:${alternation})\\b\\s*,\\s*(?=assistente)`, "gi"),
    ""
  );

  // Menção solta remanescente.
  output = output.replace(new RegExp(`\\b(?:${alternation})\\b`, "gi"), "");

  return output
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/^\s*[,.\-–—]+\s*/, "")
    .trim();
};

/* ------------------------------------------------------------------ *
 * 2. E-mail de cadastro não confirmado
 * ------------------------------------------------------------------ */

const UNCONFIRMED_EMAIL_PATTERNS = [
  /e-?mail ainda nao (?:foi )?confirmad/,
  /e-?mail nao (?:foi )?confirmad/,
  /nao confirmei (?:o )?(?:meu )?e-?mail/,
  /confirmacao de e-?mail/,
  /nao recebi o e-?mail de confirmacao/,
  /verifique sua caixa de entrada/,
  /precisa confirmar (?:o )?e-?mail/
];

/**
 * A tela pode chegar como texto digitado OU como print (o OCR da visão entra
 * no mesmo `userText`), por isso a detecção é sobre o conteúdo, não sobre o
 * canal.
 */
export const detectUnconfirmedEmailBlock = (userText: string): boolean => {
  const text = normalize(userText);
  return UNCONFIRMED_EMAIL_PATTERNS.some(pattern => pattern.test(text));
};

export const buildUnconfirmedEmailReply = (): string =>
  [
    "Sua conta existe e a senha não é o problema: o cadastro só não foi concluído porque o e-mail ainda não foi confirmado.",
    "",
    "Na mesma tela de login, dentro do aviso vermelho *E-mail ainda não confirmado*, toque em *enviar novamente*. Um novo e-mail de confirmação será disparado na hora.",
    "",
    "Depois confira a caixa de entrada e também o spam/lixo eletrônico, abra o link de confirmação e tente entrar de novo.",
    "",
    "Se o e-mail não chegar em alguns minutos, me diga qual endereço você cadastrou que eu sigo daqui."
  ].join("\n");

/* ------------------------------------------------------------------ *
 * 3. Qualificação do interesse na Nível
 * ------------------------------------------------------------------ */

export type NivelInterest =
  /** Quer usar como consumidor final, comprando e ganhando cashback. */
  | "consumer"
  /** Tem empresa/estabelecimento e quer credenciar o próprio negócio. */
  | "own_business"
  /** Quer divulgar a Nível — executivo, representante, franqueado. */
  | "promoter"
  /** Disse que quer saber mais, mas não disse para quê. */
  | "unknown"
  /** Não é conversa sobre conhecer a Nível. */
  | "none";

const WANTS_TO_KNOW = [
  /quero (?:saber|conhecer)/,
  /saber mais (?:sobre|da|do)/,
  /conhecer (?:a|o) nivel/,
  /como funciona (?:a|o) nivel/,
  /me (?:fala|conta|explica) (?:sobre|da|do) nivel/,
  /tenho interesse/,
  /gostaria de (?:saber|conhecer)/
];

const PROMOTER_PATTERNS = [
  /divulgar (?:a |o )?nivel/,
  /ser (?:um |uma )?(?:executiv|represent|franque|licenciad)/,
  /(?:quero|queria|gostaria).{0,24}(?:franquia|franquead)/,
  /trabalhar (?:com|na|no) (?:a )?nivel/,
  /revender (?:a )?nivel/,
  /levar (?:a )?nivel para (?:minha |a )?(?:cidade|regiao)/,
  /trazer (?:a )?nivel para (?:minha |a )?(?:cidade|regiao)/,
  /ser (?:a )?referencia d(?:a|o) nivel/,
  /representante d(?:a|o) nivel/
];

const OWN_BUSINESS_PATTERNS = [
  /tenho (?:uma |um )?(?:empresa|loja|comercio|estabelecimento|negocio|barbearia|restaurante|mercado|salao|clinica|petshop|pet shop|farmacia|academia|lanchonete|padaria|oficina)/,
  /minha (?:empresa|loja|barbearia|clinica|academia|padaria|oficina|farmacia|lanchonete)/,
  /meu (?:comercio|estabelecimento|negocio|restaurante|mercado|salao|petshop|pet shop)/,
  /(?:credenciar|cadastrar|colocar|incluir).{0,24}(?:minha|meu|a minha|o meu) (?:empresa|loja|comercio|estabelecimento|negocio)/,
  /vender mais com (?:a )?nivel/,
  /para (?:a )?minha empresa/,
  /sou (?:dono|proprietari|empresari|lojista|comerciante)/,
  /aceitar (?:a )?nivel n(?:a|o) (?:minha|meu)/
];

const CONSUMER_PATTERNS = [
  /(?:sou|como) (?:um )?(?:consumidor|cliente|usuari)/,
  /quero (?:comprar|usar|ganhar cashback)/,
  /(?:ganhar|receber) cashback (?:nas|em) (?:minhas )?compras/,
  /para (?:mim|uso pessoal)/,
  /(?:comprar|comprando) (?:em|nas|nos) (?:lojas|estabelecimentos)/
];

const matches = (text: string, patterns: RegExp[]): boolean =>
  patterns.some(pattern => pattern.test(text));

/**
 * Divulgar vence "tenho empresa": quem diz "tenho uma barbearia e quero trazer
 * a Nível para minha cidade" está falando de representação, não de credenciar a
 * barbearia. Os dois caminhos levam ao mesmo contato, mas o texto muda.
 */
export const classifyNivelInterest = (
  userText: string,
  conversationText = ""
): NivelInterest => {
  const text = normalize(`${conversationText} ${userText}`);

  if (matches(text, PROMOTER_PATTERNS)) {
    return "promoter";
  }

  if (matches(text, OWN_BUSINESS_PATTERNS)) {
    return "own_business";
  }

  if (matches(text, CONSUMER_PATTERNS)) {
    return "consumer";
  }

  if (matches(text, WANTS_TO_KNOW) && /\bnivel\b/.test(text)) {
    return "unknown";
  }

  return "none";
};

const formatContact = (): string =>
  `*${NIVEL_EXECUTIVE_CONTACT.name}* — ${NIVEL_EXECUTIVE_CONTACT.role}\nWhatsApp: *${NIVEL_EXECUTIVE_CONTACT.whatsapp}*`;

export const buildInterestQualifierReply = (): string =>
  [
    "Posso te explicar com precisão — só preciso saber em que ponto você entra na Nível Cashback:",
    "",
    "1. *Como consumidor* — quer comprar em estabelecimentos e receber cashback;",
    "2. *Para a sua empresa* — tem um estabelecimento e quer credenciá-lo para bonificar seus clientes;",
    "3. *Para divulgar a Nível* — quer atuar como executivo, representante ou franqueado.",
    "",
    "Me diga qual dos três é o seu caso que eu sigo pelo caminho certo."
  ].join("\n");

export const buildExecutiveContactReply = (
  interest: Extract<NivelInterest, "own_business" | "promoter">
): string => {
  const opening =
    interest === "own_business"
      ? "Perfeito — credenciamento de estabelecimento é tratado diretamente pela nossa equipe comercial, não pelo aplicativo."
      : "Perfeito — atuação como executivo, representante ou franqueado é tratada diretamente pela nossa equipe comercial.";

  return [
    opening,
    "",
    "Fale com o nosso representante executivo:",
    formatContact(),
    "",
    "Entre em contato para receber os detalhes e as condições."
  ].join("\n");
};

/**
 * Só libera o contato quando o próprio cliente comprovou o caso. "Quero saber
 * mais" sozinho não comprova nada — vira pergunta, não telefone.
 */
export const resolveNivelInterestReply = (
  userText: string,
  conversationText = ""
): { interest: NivelInterest; reply: string | null } => {
  const interest = classifyNivelInterest(userText, conversationText);

  if (interest === "own_business" || interest === "promoter") {
    return { interest, reply: buildExecutiveContactReply(interest) };
  }

  if (interest === "unknown") {
    return { interest, reply: buildInterestQualifierReply() };
  }

  return { interest, reply: null };
};
