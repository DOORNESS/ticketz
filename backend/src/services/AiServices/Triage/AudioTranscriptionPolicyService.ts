import Ticket from "../../../models/Ticket";
import Message from "../../../models/Message";
import { canAiEngageTicket, isAiHandlingTicket } from "../AiHelpers";
import { resolveHandoffModeForTicket } from "./HandoffPolicyService";
import { getAiTriageConfig } from "./AiTriageConfigService";
import { isTriageV2EnabledForCompany } from "./AiTriageFeatureFlag";

export type TranscriptionDecision = {
  shouldTranscribe: boolean;
  reason:
    | "ai_exclusive"
    | "operational_handoff"
    | "manual_request"
    | "already_completed"
    | "human_mode"
    | "disabled";
};

export const evaluateAudioTranscriptionPolicy = async ({
  ticket,
  messageId,
  requestedByUserId,
  force = false
}: {
  ticket: Ticket;
  messageId?: string;
  requestedByUserId?: number;
  force?: boolean;
}): Promise<TranscriptionDecision> => {
  if (messageId) {
    const existing = await Message.findByPk(messageId);
    const status = (existing as any)?.transcriptionStatus as string | undefined;
    if (status === "completed" && (existing as any)?.transcriptionText) {
      return { shouldTranscribe: false, reason: "already_completed" };
    }
  }

  if (!(await isTriageV2EnabledForCompany(ticket.companyId))) {
    return { shouldTranscribe: true, reason: "ai_exclusive" };
  }

  const config = await getAiTriageConfig(ticket.companyId);

  if (force && requestedByUserId && config.allowManualTranscription) {
    return { shouldTranscribe: true, reason: "manual_request" };
  }

  if (ticket.userId && !requestedByUserId) {
    return { shouldTranscribe: false, reason: "human_mode" };
  }

  if (
    isAiHandlingTicket(ticket) ||
    canAiEngageTicket(ticket) ||
    resolveHandoffModeForTicket(ticket) === "operational"
  ) {
    return { shouldTranscribe: true, reason: "ai_exclusive" };
  }

  if (config.transcribeOnlyWhenAiActive) {
    return { shouldTranscribe: false, reason: "disabled" };
  }

  return { shouldTranscribe: true, reason: "ai_exclusive" };
};
