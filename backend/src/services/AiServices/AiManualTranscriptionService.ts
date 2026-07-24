import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import { getActiveAgentForTicket } from "./AiHelpers";
import { evaluateAudioTranscriptionPolicy } from "./Triage/AudioTranscriptionPolicyService";
import { resolveInboundAudioText } from "./AudioInboundResolver";
import { readMediaBuffer } from "../../helpers/mediaStorage";
import MessageMediaFile from "../../models/MessageMediaFile";

export const transcribeTicketMessage = async ({
  ticket,
  messageId,
  user
}: {
  ticket: Ticket;
  messageId: string;
  user: User;
}): Promise<{ text: string; status: string }> => {
  const message = await Message.findOne({
    where: { id: messageId, ticketId: ticket.id, companyId: ticket.companyId }
  });

  if (!message) {
    throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
  }

  if (message.mediaType !== "audio") {
    throw new AppError("ERR_MESSAGE_NOT_AUDIO", 400);
  }

  const existingText = (message as any).transcriptionText as string | undefined;
  if (existingText?.trim()) {
    return { text: existingText, status: "completed" };
  }

  const policy = await evaluateAudioTranscriptionPolicy({
    ticket,
    messageId,
    requestedByUserId: user.id,
    force: true
  });

  if (!policy.shouldTranscribe) {
    throw new AppError("ERR_TRANSCRIPTION_NOT_ALLOWED", 403);
  }

  await message.update({
    transcriptionStatus: "processing",
    transcriptionRequestedBy: user.id,
    transcriptionReason: "manual_request"
  } as any);

  const agent = await getActiveAgentForTicket(ticket);
  if (!agent) {
    throw new AppError("ERR_NO_ACTIVE_AI_AGENT", 404);
  }

  const mediaFile = await MessageMediaFile.findOne({
    where: { companyId: ticket.companyId, messageId }
  });

  const mediaUrl = message.mediaUrl || mediaFile?.publicUrl;
  const audioBuffer = mediaUrl
    ? await readMediaBuffer(mediaUrl, ticket.companyId)
    : null;

  const result = await resolveInboundAudioText({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    messageId,
    audioBuffer,
    mediaUrl,
    filename: mediaFile?.originalFilename || "audio.ogg",
    mimeType: mediaFile?.mimeType || message.mediaType,
    existingText: message.body || "",
    transcriptionModel: agent.transcriptionModel,
    providerId: agent.provider
  });

  if (!result.success || !result.text) {
    await message.update({
      transcriptionStatus: "failed",
      transcriptionReason: result.errorReason || "transcribe_failed"
    } as any);
    throw new AppError("ERR_AUDIO_TRANSCRIPTION_FAILED", 422);
  }

  await message.update({
    transcriptionStatus: "completed",
    transcriptionText: result.text,
    transcriptionRequestedBy: user.id,
    transcriptionReason: "manual_request"
  } as any);

  return { text: result.text, status: "completed" };
};
