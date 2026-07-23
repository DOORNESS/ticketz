import fs from "fs";
import os from "os";
import path from "path";
import { FileContents } from "@flystorage/file-storage";
import axios from "axios";
import StorageService from "../services/StorageService/StorageService";
import { getPublicPath } from "./GetPublicPath";
import { makeRandomId } from "./MakeRandomId";
import { logger } from "../utils/logger";

export const streamToBuffer = async (data: FileContents): Promise<Buffer> => {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === "string") {
    return Buffer.from(data);
  }

  const chunks: Buffer[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of data as AsyncIterable<Uint8Array | Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks as unknown as Uint8Array[]);
};

export const inferMediaFolder = (
  mimetype: string,
  baseFolder?: string,
  persistant?: boolean
): string => {
  if (persistant || baseFolder === "media-persistant") {
    return "persistent/media";
  }

  if (baseFolder) {
    return baseFolder;
  }

  const normalized = (mimetype || "").split(";")[0].toLowerCase();
  const [type, subtype] = normalized.split("/");

  if (type === "audio") return "media/audio";
  if (type === "image") return "media/images";
  if (type === "video") return "media/video";

  if (
    subtype?.includes("pdf") ||
    subtype?.includes("document") ||
    subtype?.includes("msword") ||
    subtype?.includes("spreadsheet") ||
    subtype?.includes("presentation") ||
    normalized.includes("officedocument")
  ) {
    return "media/documents";
  }

  return "media/attachments";
};

export const normalizeStorageReference = (mediaPath: string): string =>
  mediaPath.replace(/^\/public\//, "").trim();

export const extractCompanyIdFromStorageKey = (
  mediaKey: string,
  fallback = 1
): number => {
  const normalized = normalizeStorageReference(mediaKey);
  const parts = normalized.split("/").filter(Boolean);

  if (parts[0] === "companies" && parts[1]) {
    const companyId = Number.parseInt(parts[1], 10);
    if (Number.isFinite(companyId) && companyId > 0) {
      return companyId;
    }
  }

  if (parts[0] === "suporte" && parts[1]) {
    const companyId = Number.parseInt(parts[1], 10);
    if (Number.isFinite(companyId) && companyId > 0) {
      return companyId;
    }
  }

  const first = Number.parseInt(parts[0] || "", 10);
  if (Number.isFinite(first) && first > 0) {
    return first;
  }

  return fallback;
};

export const extractStorageKeyFromUrl = (mediaUrl: string): string | null => {
  if (!/^https?:\/\//i.test(mediaUrl)) {
    return null;
  }

  try {
    const url = new URL(mediaUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);

    const companiesIndex = pathParts.findIndex(part => part === "companies");
    if (companiesIndex >= 0) {
      return pathParts.slice(companiesIndex).join("/");
    }

    const suporteIndex = pathParts.findIndex(part => part === "suporte");
    if (suporteIndex >= 0) {
      return pathParts.slice(suporteIndex).join("/");
    }

    if (pathParts.length >= 2) {
      return pathParts.slice(-4).join("/");
    }
  } catch {
    return null;
  }

  return null;
};

export const readMediaBuffer = async (
  mediaPath: string,
  companyId: number
): Promise<Buffer | null> => {
  if (!mediaPath?.trim()) {
    return null;
  }

  const tryStorageDownload = async (key: string): Promise<Buffer | null> => {
    try {
      await StorageService.ensureReady(companyId);
      const buffer = await StorageService.download(key, companyId);
      if (buffer?.length) {
        logger.info(
          { mediaPath, storageKey: key, companyId, bufferSize: buffer.length },
          "AudioPipeline:storage_read"
        );
        return buffer;
      }
    } catch (storageError) {
      logger.warn(
        { storageError, storageKey: key, mediaPath, companyId },
        "Object storage download failed"
      );
    }
    return null;
  };

  if (!/^https?:\/\//i.test(mediaPath)) {
    const localPath = path.join(getPublicPath(), mediaPath);
    if (fs.existsSync(localPath)) {
      const buffer = fs.readFileSync(localPath);
      logger.info(
        { mediaPath, bufferSize: buffer.length },
        "AudioPipeline:buffer_loaded"
      );
      return buffer;
    }

    const key = normalizeStorageReference(mediaPath);
    const storageBuffer = await tryStorageDownload(key);
    if (storageBuffer) {
      return storageBuffer;
    }

    logger.error(
      { mediaPath, companyId },
      "Media not found in local or object storage"
    );
    return null;
  }

  const storageKey = extractStorageKeyFromUrl(mediaPath);
  if (storageKey) {
    const storageBuffer = await tryStorageDownload(storageKey);
    if (storageBuffer) {
      return storageBuffer;
    }
  }

  try {
    const response = await axios.get(mediaPath, {
      responseType: "arraybuffer",
      timeout: 30000
    });
    const buffer = Buffer.from(response.data);
    logger.info(
      { mediaPath, bufferSize: buffer.length },
      "AudioPipeline:download_ok"
    );
    return buffer;
  } catch (error) {
    logger.error({ error, mediaPath }, "Failed to download media from URL");
    return null;
  }
};

export const resolveMediaAccessPath = async (
  mediaPath: string,
  companyId: number
): Promise<string | null> => {
  if (!mediaPath?.trim()) {
    return null;
  }

  if (/^https?:\/\//i.test(mediaPath)) {
    return mediaPath;
  }

  const localPath = path.join(getPublicPath(), mediaPath);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  const buffer = await readMediaBuffer(mediaPath, companyId);
  if (!buffer) {
    return null;
  }

  const filename = path.basename(mediaPath) || `media-${makeRandomId(6)}.bin`;
  const tempPath = path.join(
    os.tmpdir(),
    `ticketz-${makeRandomId(8)}-${filename}`
  );
  fs.writeFileSync(tempPath, buffer as Uint8Array);
  return tempPath;
};

export const deleteStoredMedia = async (
  mediaPath: string,
  companyId: number
): Promise<void> => {
  if (!mediaPath?.trim()) {
    return;
  }

  if (/^https?:\/\//i.test(mediaPath)) {
    return;
  }

  const localPath = path.join(getPublicPath(), mediaPath);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    return;
  }

  try {
    await StorageService.ensureReady(companyId);
    const key = normalizeStorageReference(mediaPath);
    await StorageService.delete(key, companyId);
  } catch (error) {
    logger.debug({ error, mediaPath }, "Could not delete media from storage");
  }
};

export const toStoredMediaReference = (input: {
  key: string;
  publicUrl: string;
}): string => input.key;
