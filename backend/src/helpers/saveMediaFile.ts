import mime from "mime-types";
import { FileContents } from "@flystorage/file-storage";
import { logger } from "../utils/logger";
import Ticket from "../models/Ticket";
import StorageService from "../services/StorageService/StorageService";
import {
  inferMediaFolder,
  streamToBuffer,
  toStoredMediaReference
} from "./mediaStorage";
import {
  persistUnifiedMediaFile,
  resolveMediaTypeFromMime
} from "../services/AiServices/media/UnifiedMediaPersistenceService";

type SaveMediaOptions = {
  destination: Ticket | number;
  persistant?: boolean;
  baseFolder?: string;
};

export default async function saveMediaToFile(
  media: {
    data: FileContents;
    mimetype: string;
    filename: string;
  },
  { destination, persistant, baseFolder }: SaveMediaOptions
): Promise<string> {
  if (!media || !media.data || !media.mimetype || !destination) {
    logger.error("saveMediaToFile: Invalid media or destination provided");
    throw new Error("Invalid media or destination provided");
  }

  if (!media.filename) {
    const rawMimetype = media.mimetype.split(";")[0];
    const ext = mime.extension(rawMimetype) || "bin";
    media.filename = `${new Date().getTime()}.${ext}`;
  }

  const companyId =
    typeof destination === "number" ? destination : destination.companyId;
  const ticketId = typeof destination === "number" ? undefined : destination.id;

  await StorageService.ensureReady(companyId);

  const buffer = await streamToBuffer(media.data);
  const folder = inferMediaFolder(media.mimetype, baseFolder, persistant);

  const upload = await StorageService.uploadBuffer(buffer, {
    companyId,
    ticketId,
    filename: media.filename,
    contentType: media.mimetype.split(";")[0] || "application/octet-stream",
    folder
  });

  if (ticketId) {
    await persistUnifiedMediaFile({
      companyId,
      ticketId,
      mediaType: resolveMediaTypeFromMime(media.mimetype),
      mimeType: media.mimetype.split(";")[0] || "application/octet-stream",
      filename: media.filename,
      storageKey: upload.key,
      publicUrl: upload.publicUrl,
      sizeBytes: buffer.length,
      direction: "inbound"
    });
  }

  return toStoredMediaReference({
    key: upload.key,
    publicUrl: upload.publicUrl
  });
}
