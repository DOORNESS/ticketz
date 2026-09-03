import AiAgent from "../../models/AiAgent";
import {
  detectAgentBrand,
  resolveAgentInformationalFallback
} from "./AgentPersonaService";
import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";
import { stripAssistantProperName } from "./NivelAssistantPolicy";

const UNSUPPORTED_PROCEDURE_PATTERN =
  /n[aã]o (?:tenho|encontrei|possuo|consigo).{0,50}(?:link|procedimento|informa[cç][aã]o|agend)|n[aã]o (?:é|e) poss[ií]vel.{0,30}agend/i;

const VISION_DENIAL_PATTERN =
  /(?:infelizmente,?|desculpe,? mas)? n[aã]o consigo ver imagens?|n[aã]o consigo ver (?:a )?imagem|n[aã]o (?:tenho|posso) ver imagens?/i;

const mentionsInboundImage = (text: string): boolean =>
  /\[Imagem enviada pelo cliente\]/i.test(text) ||
  /\b(?:consegue|pode) ver (?:a )?imagem\b/i.test(text) ||
  /\bveja (?:a )?imagem\b/i.test(text) ||
  /\benviei (?:a )?imagem\b/i.test(text);

type AgentWithBrand = Pick<AiAgent, "name" | "basePrompt"> & {
  brand?: {
    slug?: string | null;
    supportContacts?: { whatsapp?: string | null }[] | null;
  } | null;
};

/** Abaixo disso o que sobrou não responde nada e é melhor usar o fallback. */
const MIN_USEFUL_REPLY_LENGTH = 60;

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.trim())
    .filter(Boolean);

/**
 * Remove apenas as frases problemáticas, preservando o restante da resposta.
 */
const removeOffendingSentences = (
  text: string,
  flags: { unsupportedProcedure: boolean; portalWithoutUrl: boolean }
): string => {
  const kept = splitSentences(text).filter(sentence => {
    if (
      flags.unsupportedProcedure &&
      UNSUPPORTED_PROCEDURE_PATTERN.test(sentence)
    ) {
      return false;
    }
    if (
      flags.portalWithoutUrl &&
      /portal (?:de|do) clientes?/i.test(sentence) &&
      !/https?:\/\//i.test(sentence)
    ) {
      return false;
    }
    return true;
  });

  return kept
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

export const prepareCustomerFacingAiText = (
  text: string,
  userText: string,
  agent?: AgentWithBrand | null
): string => {
  const brand = detectAgentBrand(agent);

  // Divulgar telefone é propriedade da marca, não do slug "fortmax": quem tem
  // contato de suporte cadastrado pode divulgá-lo. Uma marca nova com contatos
  // passa a poder sem tocar em código; a Nível, sem contatos, segue sem poder.
  const contacts = agent?.brand?.supportContacts;
  const allowSupportPhone = contacts
    ? contacts.some(contact => contact?.whatsapp)
    : brand === "fortmax" || brand === "nivel";

  let sanitized = sanitizeAiOutboundText(text, { allowSupportPhone }).trim();

  // Nome próprio do assistente não chega ao cliente na Nível. O prompt gravado
  // em produção ainda diz o nome, então a regra tem que valer na saída — não
  // adianta só trocar a semente da marca.
  if (brand === "nivel") {
    sanitized = stripAssistantProperName(sanitized, agent?.name);
  }

  if (
    (mentionsInboundImage(userText) || mentionsInboundImage(text)) &&
    VISION_DENIAL_PATTERN.test(sanitized)
  ) {
    sanitized = sanitized.replace(VISION_DENIAL_PATTERN, "").trim();
    sanitized = sanitized.replace(/^\s*[,.\-–—]+\s*/, "");
    if (!sanitized || sanitized.length < 24) {
      return resolveAgentInformationalFallback(agent, userText);
    }
  }

  const unsupportedProcedure = UNSUPPORTED_PROCEDURE_PATTERN.test(sanitized);

  // Mandar o cliente "acessar o portal" sem dizer onde não ajuda ninguém, e
  // isso não é específico da Fortmax — vale para qualquer marca. Antes a
  // checagem estava presa ao slug e nascia desligada para marca nova.
  const portalWithoutUrl =
    /portal (?:de|do) clientes?/i.test(sanitized) &&
    !/https?:\/\//i.test(sanitized);

  if (unsupportedProcedure || portalWithoutUrl) {
    // Uma ressalva no meio de uma resposta útil não invalida a resposta.
    //
    // "O cashback cai na hora. Não encontrei o valor mínimo de resgate, quer
    // que eu verifique?" era descartada inteira e substituída por "não
    // encontrei orientação segura" — o cliente perdia a parte que respondia a
    // pergunta dele e recebia a frase que mais irrita. Agora só a frase
    // problemática sai; o resto fica, desde que ainda sobre resposta.
    const trimmed = removeOffendingSentences(sanitized, {
      unsupportedProcedure,
      portalWithoutUrl
    });

    if (trimmed.length >= MIN_USEFUL_REPLY_LENGTH) {
      return trimmed;
    }

    return resolveAgentInformationalFallback(agent, userText);
  }

  return sanitized;
};
