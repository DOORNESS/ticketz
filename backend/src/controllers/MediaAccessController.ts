import { Request, Response } from "express";
import mime from "mime-types";
import User from "../models/User";
import AppError from "../errors/AppError";
import {
  assertMediaAccess,
  parseMediaAccessToken,
  resolveStorageKeyFromMessage
} from "../services/MediaServices/MediaAuthorizationService";
import { getSignedUrlForMedia } from "../services/MediaServices/MediaAccessService";
import StorageService from "../services/StorageService/StorageService";
import MessageMediaFile from "../models/MessageMediaFile";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { canViewTicket } from "../helpers/canViewTicket";

export const accessByToken = async (
  req: Request,
  res: Response
): Promise<Response | void> => {
  const token = req.params.token;
  const parsed = parseMediaAccessToken(token);

  if (!parsed) {
    return res.status(401).json({ error: "ERR_MEDIA_ACCESS_DENIED" });
  }

  const media = await MessageMediaFile.findOne({
    where: { id: parsed.mediaId, companyId: parsed.companyId }
  });

  if (!media) {
    return res.status(404).json({ error: "ERR_MEDIA_NOT_FOUND" });
  }

  const user = await User.findByPk(parsed.userId);
  if (!user) {
    return res.status(401).json({ error: "ERR_MEDIA_ACCESS_DENIED" });
  }

  await assertMediaAccess({
    user,
    mediaId: media.id,
    companyId: parsed.companyId
  });

  const buffer = await StorageService.download(
    media.storageKey,
    media.companyId
  );
  const contentType =
    media.mimeType ||
    mime.lookup(media.originalFilename || media.storageKey || "") ||
    "application/octet-stream";
  res.setHeader("Content-Type", String(contentType));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  if (req.query.inline === "1" || /^image\//i.test(String(contentType))) {
    res.setHeader("Content-Disposition", "inline");
  }
  return res.send(buffer);
};

export const signedUrl = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const mediaId = Number(req.params.mediaId);
  const { companyId, id: userId } = req.user;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  const media = await assertMediaAccess({
    user,
    mediaId,
    companyId
  });

  const url = await getSignedUrlForMedia(media);

  return res.json({
    url,
    expiresInSeconds: Number(process.env.B2_SIGNED_URL_TTL_SECONDS || 900),
    mediaId: media.id
  });
};

export const streamById = async (
  req: Request,
  res: Response
): Promise<Response | void> => {
  const mediaId = Number(req.params.mediaId);
  const { companyId, id: userId } = req.user;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  const media = await assertMediaAccess({
    user,
    mediaId,
    companyId
  });

  const buffer = await StorageService.download(
    media.storageKey,
    media.companyId
  );
  const contentType =
    media.mimeType ||
    mime.lookup(media.originalFilename || "") ||
    "application/octet-stream";
  res.setHeader("Content-Type", String(contentType));
  if (req.query.inline === "1") {
    res.setHeader("Content-Disposition", "inline");
  }
  return res.send(buffer);
};

export const streamByMessageId = async (
  req: Request,
  res: Response
): Promise<Response | void> => {
  const messageId = req.params.messageId;
  const { companyId, id: userId } = req.user;
  const user = await User.findByPk(userId);

  if (!user) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  const message = await Message.findOne({
    where: { id: messageId, companyId },
    attributes: ["id", "ticketId", "mediaUrl", "mediaType"]
  });
  if (!message) {
    throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  }

  const ticket = await Ticket.findOne({
    where: { id: message.ticketId, companyId }
  });
  if (!ticket || !canViewTicket(ticket, user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const media = await MessageMediaFile.findOne({
    where: { companyId, messageId: message.id }
  });
  const storageKey =
    media?.storageKey || resolveStorageKeyFromMessage(message.mediaUrl);
  if (!storageKey) {
    throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  }

  const buffer = await StorageService.download(storageKey, companyId);
  const contentType =
    media?.mimeType ||
    mime.lookup(media?.originalFilename || storageKey) ||
    (message.mediaType === "image" ? "image/jpeg" : "application/octet-stream");

  res.setHeader("Content-Type", String(contentType));
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  return res.send(buffer);
};

export const unavailable = async (
  req: Request,
  res: Response
): Promise<Response> => {
  return res.status(410).json({
    error: "ERR_MEDIA_UNAVAILABLE",
    message: "Mídia removida conforme política de retenção ou exclusão."
  });
};
