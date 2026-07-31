import fs from "fs";
import os from "os";
import path from "path";
import AppError from "../../errors/AppError";
import ContentRepositoryItem from "../../models/ContentRepositoryItem";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import StorageService from "../StorageService/StorageService";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import {
  canAccessRepositoryItem,
  getRepositoryItem,
  recordRepositoryUsage,
  resolveRepositoryMime,
  buildRepositoryAccessForTicket
} from "./ContentRepositoryService";
import { logAiTicketTimelineEvent } from "../AiServices/Triage/AiTicketTimelineService";
import { logger } from "../../utils/logger";

export type SendRepositoryItemInput = {
  companyId: number;
  ticketId: number;
  itemId: number;
  userId: number;
  profile: string;
  caption?: string;
  sentByAi?: boolean;
  aiAgentId?: number;
  toolExecutionId?: number;
  reason?: string;
};

const buildTextPayload = (
  item: ContentRepositoryItem,
  caption?: string
): string => {
  const parts: string[] = [];
  const intro = (caption || item.sendCaption || "").trim();
  if (intro) {
    parts.push(intro);
  }

  if (item.contentType === "link" && item.externalUrl) {
    parts.push(item.externalUrl);
  } else if (item.contentType === "text") {
    parts.push(item.description || item.displayTitle || item.name);
  } else if (item.externalUrl) {
    parts.push(item.externalUrl);
  }

  return parts.filter(Boolean).join("\n\n");
};

const writeTempFile = async (
  buffer: Buffer,
  fileName: string
): Promise<string> => {
  const tempPath = path.join(
    os.tmpdir(),
    `ticketz-repo-${Date.now()}-${fileName.replace(/[^\w.-]/g, "_")}`
  );
  await fs.promises.writeFile(tempPath, Uint8Array.from(buffer));
  return tempPath;
};

const REPOSITORY_SEND_RETRY_DELAYS_MS = [0, 3000, 6000, 9000];

const wait = (milliseconds: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });

const sendWithConnectionRetry = async <T>(
  operation: () => Promise<T>,
  context: { ticketId: number; itemId: number; contentType: string }
): Promise<T> => {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt < REPOSITORY_SEND_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    const delay = REPOSITORY_SEND_RETRY_DELAYS_MS[attempt];
    if (delay) {
      await wait(delay);
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof AppError && error.message === "ERR_SENDING_WAPP_MSG";
      const hasMoreAttempts =
        attempt < REPOSITORY_SEND_RETRY_DELAYS_MS.length - 1;

      if (!retryable || !hasMoreAttempts) {
        throw error;
      }

      logger.warn(
        {
          ...context,
          attempt: attempt + 1,
          nextRetryMs: REPOSITORY_SEND_RETRY_DELAYS_MS[attempt + 1]
        },
        "Repository WhatsApp send waiting for connection recovery"
      );
    }
  }

  throw lastError;
};

export const sendRepositoryItemToTicket = async (
  input: SendRepositoryItemInput
): Promise<{ item: ContentRepositoryItem; messageType: "text" | "media" }> => {
  const item = await getRepositoryItem(input.companyId, input.itemId);

  const ticket = await Ticket.findOne({
    where: { id: input.ticketId, companyId: input.companyId },
    include: ["contact", "whatsapp"]
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET", 404);
  }

  if (ticket.status === "closed") {
    throw new AppError("ERR_TICKET_CLOSED", 400);
  }

  if (ticket.status !== "open" && ticket.status !== "pending") {
    throw new AppError("ERR_TICKET_INVALID_STATUS", 400);
  }

  const user = input.sentByAi
    ? null
    : await User.findByPk(input.userId, { include: ["queues"] });
  if (!input.sentByAi && !user) {
    throw new AppError("ERR_NO_USER", 404);
  }

  if (
    !input.sentByAi &&
    ticket.userId &&
    Number(ticket.userId) !== Number(input.userId) &&
    input.profile !== "admin"
  ) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const accessCtx = user
    ? buildRepositoryAccessForTicket(ticket, user, {
        forAi: !!input.sentByAi,
        aiAgentId: input.aiAgentId
      })
    : {
        userId: input.userId,
        profile: input.profile,
        companyId: input.companyId,
        queueIds: ticket.queueId ? [ticket.queueId] : [],
        aiAgentId: input.aiAgentId,
        forAi: true
      };

  if (!canAccessRepositoryItem(item, accessCtx)) {
    throw new AppError("ERR_REPOSITORY_ACCESS_DENIED", 403);
  }

  const textPayload = buildTextPayload(item, input.caption);
  const textOnlyTypes = new Set([
    "link",
    "text",
    "message_template",
    "internal_instruction",
    "location"
  ]);

  if (textOnlyTypes.has(item.contentType) || !item.storageKey) {
    if (item.contentType === "internal_instruction") {
      throw new AppError("ERR_REPOSITORY_NOT_DELIVERABLE", 400);
    }
    if (!textPayload) {
      if (
        ["image", "pdf", "audio", "video", "document", "file"].includes(
          item.contentType
        )
      ) {
        throw new AppError("ERR_REPOSITORY_MEDIA_MISSING", 400);
      }
      throw new AppError("ERR_REPOSITORY_EMPTY_PAYLOAD", 400);
    }
    await sendWithConnectionRetry(
      () =>
        SendWhatsAppMessage({
          body: textPayload,
          ticket,
          userId: input.sentByAi ? null : input.userId
        }),
      {
        ticketId: ticket.id,
        itemId: item.id,
        contentType: item.contentType
      }
    );
    await recordRepositoryUsage({
      item,
      companyId: input.companyId,
      ticketId: input.ticketId,
      userId: input.sentByAi ? null : input.userId,
      channel: ticket.channel,
      source: input.sentByAi ? "ai" : "human",
      aiAgentId: input.aiAgentId,
      success: true
    });
    await logRepositorySend(input, item, "text");
    return { item, messageType: "text" };
  }

  const buffer = await StorageService.download(
    item.storageKey,
    input.companyId
  );

  if (!buffer?.length) {
    throw new AppError("ERR_REPOSITORY_MEDIA_MISSING", 400);
  }
  const fileName = item.originalFileName || `${item.name}`;
  const tempPath = await writeTempFile(buffer, fileName);

  try {
    const media = {
      path: tempPath,
      originalname: fileName,
      mimetype: resolveRepositoryMime(item),
      size: buffer.length
    } as Express.Multer.File;

    await sendWithConnectionRetry(
      () =>
        SendWhatsAppMedia({
          media,
          ticket,
          caption: textPayload || undefined,
          ptt: item.contentType === "audio"
        }),
      {
        ticketId: ticket.id,
        itemId: item.id,
        contentType: item.contentType
      }
    );
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }

  await recordRepositoryUsage({
    item,
    companyId: input.companyId,
    ticketId: input.ticketId,
    userId: input.sentByAi ? null : input.userId,
    channel: ticket.channel,
    source: input.sentByAi ? "ai" : "human",
    aiAgentId: input.aiAgentId,
    success: true
  });
  await logRepositorySend(input, item, "media");
  return { item, messageType: "media" };
};

const logRepositorySend = async (
  input: SendRepositoryItemInput,
  item: ContentRepositoryItem,
  messageType: "text" | "media"
): Promise<void> => {
  try {
    await logAiTicketTimelineEvent({
      companyId: input.companyId,
      ticketId: input.ticketId,
      eventType: input.sentByAi
        ? "repository_item_sent_by_ai"
        : "repository_item_sent",
      agentId: input.aiAgentId,
      details: {
        repositoryItemId: item.id,
        itemName: item.name,
        contentType: item.contentType,
        messageType,
        reason: input.reason || null,
        toolExecutionId: input.toolExecutionId || null
      }
    });
  } catch {
    // timeline must not block send
  }
};

export default sendRepositoryItemToTicket;
