import AiAgent from "../../models/AiAgent";
import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";

export const prepareCustomerFacingAiText = (
  text: string,
  _userText: string,
  _agent?: Pick<AiAgent, "name" | "basePrompt"> | null
): string => sanitizeAiOutboundText(text).trim();
