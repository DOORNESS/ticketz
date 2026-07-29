import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";

export const prepareCustomerFacingAiText = (
  text: string,
  _userText: string
): string => sanitizeAiOutboundText(text).trim();
