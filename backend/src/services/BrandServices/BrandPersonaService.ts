import Brand, { BrandSupportContact } from "../../models/Brand";
import { buildNivelHumanSupportReply } from "../AiServices/AgentPersonaService";

/**
 * Persona e textos da marca, a partir dos DADOS da Brand.
 *
 * Substitui `AgentPersonaService.detectAgentBrand`, que inferia a marca lendo
 * substring do nome/prompt do agente, e devolvia textos, telefones e URLs
 * compilados no código. Aqui nada é inferido: o que vale é o registro.
 *
 * Criar uma marca nova não exige tocar neste arquivo — é essa a diferença.
 */

export const buildBrandIdentityReply = (brand?: Brand | null): string | null =>
  brand?.identityReply?.trim() ||
  (brand?.identityName?.trim()
    ? `Me chamo ${brand.identityName.trim()}.`
    : null);

const formatContact = (contact: BrandSupportContact): string => {
  const role = contact.role ? ` (${contact.role})` : "";
  const channel = contact.whatsapp
    ? ` no WhatsApp ${contact.whatsapp}`
    : contact.email
      ? ` pelo e-mail ${contact.email}`
      : "";
  return `${contact.name}${role}${channel}`;
};

/**
 * Fallback quando a base não trouxe procedimento seguro.
 *
 * Ordem de preferência: texto configurado → contatos configurados →
 * URL de escalação → genérico. A marca decide, não o código.
 */
export const buildBrandInformationalFallback = (
  brand?: Brand | null
): string | null => {
  if (!brand) {
    return null;
  }

  const base = brand.informationalFallback?.trim();
  const contacts = (brand.supportContacts || []).filter(item => item?.name);

  if (base && contacts.length) {
    return `${base} ${contacts.map(formatContact).join(". ")}.`;
  }

  if (base) {
    return base;
  }

  if (contacts.length) {
    return `Não encontrei esse procedimento com segurança na base. ${contacts
      .map(formatContact)
      .join(". ")}.`;
  }

  if (brand.escalationUrl?.trim()) {
    return `Não encontrei uma orientação segura para esse caso nos materiais disponíveis. Abra um chamado em ${brand.escalationUrl.trim()} e descreva o que aconteceu.`;
  }

  return null;
};

export const buildBrandExternalSupportReply = (
  brand?: Brand | null
): string | null => {
  if (!brand) {
    return null;
  }

  const contacts = (brand.supportContacts || []).filter(item => item?.name);
  if (contacts.length) {
    return `Entendi. Para falar com um atendente humano: ${contacts
      .map(formatContact)
      .join(". ")}.`;
  }

  if (brand.slug === "nivel") {
    return buildNivelHumanSupportReply();
  }

  if (brand.escalationUrl?.trim()) {
    return `Para continuar com uma pessoa da equipe, abra um chamado em ${brand.escalationUrl.trim()}. Descreva o que aconteceu e anexe os comprovantes necessários diretamente no formulário.`;
  }

  return null;
};

/**
 * Regras operacionais derivadas da configuração da marca.
 * Substitui `buildAgentOperationalRules`, que trazia blocos fixos por marca.
 */
export const buildBrandOperationalRules = (
  brand?: Brand | null
): string | null => {
  if (!brand) {
    return null;
  }

  const lines: string[] = [];
  const label = brand.name?.trim();

  if (label) {
    lines.push(
      `Você atende exclusivamente a operação ${label}. Não responda como outra marca do grupo; se o assunto for de outra operação, diga que este canal é da ${label}.`
    );
  }

  const vocabulary = (brand.vocabulary || []).filter(Boolean);
  if (vocabulary.length) {
    lines.push(
      `Termos próprios desta operação: ${vocabulary.join(", ")}. Quando aparecerem, referem-se a esta marca e aos seus produtos, nunca ao sentido genérico da palavra.`
    );
  }

  if (brand.escalationUrl?.trim()) {
    lines.push(
      `Se os materiais recuperados não trouxerem procedimento seguro para concluir o caso, encaminhe para ${brand.escalationUrl.trim()}.`
    );
  }

  if (!(brand.supportContacts || []).length) {
    lines.push(
      "Nunca informe telefone ou WhatsApp de atendimento; conduza o procedimento apenas com as orientações e links presentes no contexto."
    );
  }

  return lines.length ? lines.join("\n") : null;
};

/** Vocabulário de todas as marcas ativas — usado por classificadores genéricos. */
export const getVocabularyForBrand = (brand?: Brand | null): string[] =>
  (brand?.vocabulary || []).filter(Boolean);
