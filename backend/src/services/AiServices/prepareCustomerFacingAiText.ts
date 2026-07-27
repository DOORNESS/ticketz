import {
  detectRequiresHumanAccountEscalation,
  NIVEL_SUPPORT_WHATSAPP_DISPLAY
} from "./AiHelpers";
import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";

export const prepareCustomerFacingAiText = (
  text: string,
  userText: string
): string => {
  const allowSupportPhone = detectRequiresHumanAccountEscalation(userText);
  let sanitized = sanitizeAiOutboundText(text, {
    allowSupportPhone
  });

  if (!sanitized?.trim()) {
    return "";
  }

  if (allowSupportPhone && !sanitized.includes("99165")) {
    sanitized = `${sanitized.trim()}\n\nPara concluir essa solicitação com segurança, entre em contato com nosso suporte pelo WhatsApp ${NIVEL_SUPPORT_WHATSAPP_DISPLAY}.`;
  }

  return sanitized.trim();
};
