import crypto from "crypto";
import MessageMediaFile from "../../models/MessageMediaFile";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { canViewTicket } from "../../helpers/canViewTicket";
import AppError from "../../errors/AppError";
import {
  extractStorageKeyFromUrl,
  normalizeStorageReference
} from "../../helpers/mediaStorage";

export const resolveStorageKeyFromMessage = (
  mediaUrl: string | null | undefined
): string | null => {
  if (!mediaUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(mediaUrl)) {
    return extractStorageKeyFromUrl(mediaUrl) || null;
  }

  return normalizeStorageReference(mediaUrl);
};

export const assertMediaAccess = async ({
  user,
  mediaId,
  storageKey,
  companyId
}: {
  user: User;
  mediaId?: number;
  storageKey?: string;
  companyId: number;
}): Promise<MessageMediaFile> => {
  let media: MessageMediaFile | null = null;

  if (mediaId) {
    media = await MessageMediaFile.findOne({
      where: { id: mediaId, companyId }
    });
  } else if (storageKey) {
    media = await MessageMediaFile.findOne({
      where: { storageKey, companyId }
    });
  }

  if (!media) {
    throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  }

  if (media.status === "deleted" || media.status === "expired") {
    throw new AppError("ERR_MEDIA_UNAVAILABLE", 410);
  }

  if (media.ticketId) {
    const ticket = await Ticket.findOne({
      where: { id: media.ticketId, companyId }
    });

    if (!ticket) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }

    if (!canViewTicket(ticket, user)) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  } else if (user.profile !== "admin" && !user.super) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return media;
};

export const buildMediaAccessToken = (input: {
  mediaId: number;
  companyId: number;
  userId: number;
  expiresAtMs: number;
}): string => {
  const secret =
    process.env.MEDIA_ACCESS_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "media-access-dev-secret";
  const payload = `${input.mediaId}:${input.companyId}:${input.userId}:${input.expiresAtMs}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
};

export const parseMediaAccessToken = (
  token: string
): {
  mediaId: number;
  companyId: number;
  userId: number;
  expiresAtMs: number;
} | null => {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [mediaId, companyId, userId, expiresAtMs, signature] =
      decoded.split(":");

    if (!mediaId || !companyId || !userId || !expiresAtMs || !signature) {
      return null;
    }

    const secret =
      process.env.MEDIA_ACCESS_TOKEN_SECRET ||
      process.env.JWT_SECRET ||
      "media-access-dev-secret";
    const payload = `${mediaId}:${companyId}:${userId}:${expiresAtMs}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expected !== signature) {
      return null;
    }

    if (Date.now() > Number(expiresAtMs)) {
      return null;
    }

    return {
      mediaId: Number(mediaId),
      companyId: Number(companyId),
      userId: Number(userId),
      expiresAtMs: Number(expiresAtMs)
    };
  } catch {
    return null;
  }
};

export const assertPermanentDeletePermission = (user: User): void => {
  if (user.profile === "admin" || user.super) {
    return;
  }

  throw new AppError("ERR_NO_PERMISSION", 403);
};
