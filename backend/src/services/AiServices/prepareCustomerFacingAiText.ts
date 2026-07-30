import AiAgent from "../../models/AiAgent";
import {
  detectAgentBrand,
  resolveAgentInformationalFallback
} from "./AgentPersonaService";
import { sanitizeAiOutboundText } from "./sanitizeAiOutboundText";

const UNSUPPORTED_PROCEDURE_PATTERN =
  /n[aã]o (?:tenho|encontrei|possuo|consigo).{0,50}(?:link|procedimento|informa[cç][aã]o|agend)|n[aã]o (?:é|e) poss[ií]vel.{0,30}agend/i;

export const prepareCustomerFacingAiText = (
  text: string,
  userText: string,
  agent?: Pick<AiAgent, "name" | "basePrompt"> | null
): string => {
  const brand = detectAgentBrand(agent);
  const sanitized = sanitizeAiOutboundText(text, {
    allowSupportPhone: detectAgentBrand(agent) === "fortmax"
  }).trim();
  const unsupportedProcedure = UNSUPPORTED_PROCEDURE_PATTERN.test(sanitized);
  const unsupportedFortmaxPortal =
    brand === "fortmax" &&
    /portal (?:de|do) clientes?/i.test(sanitized) &&
    !/https?:\/\//i.test(sanitized);

  if (unsupportedProcedure || unsupportedFortmaxPortal) {
    return resolveAgentInformationalFallback(agent, userText);
  }

  return sanitized;
};
