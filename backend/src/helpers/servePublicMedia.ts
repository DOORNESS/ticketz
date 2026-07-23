import path from "path";
import fs from "fs";
import mime from "mime-types";
import { Request, Response } from "express";
import uploadConfig from "../config/upload";
import {
  readMediaBuffer,
  normalizeStorageReference,
  extractCompanyIdFromStorageKey
} from "./mediaStorage";
import StorageService from "../services/StorageService/StorageService";

const setContentType = (res: Response, filePath: string): void => {
  const ext = path.extname(filePath).toLowerCase();
  const type =
    mime.lookup(ext) ||
    (ext === ".opus" ? "audio/opus" : null) ||
    "application/octet-stream";
  res.setHeader("Content-Type", String(type));
};

export const servePublicMedia = async (
  req: Request,
  res: Response
): Promise<void> => {
  const mediaKey = decodeURIComponent(
    (req.params as Record<string, string>)[0] || ""
  );
  const localPath = path.join(uploadConfig.directory, mediaKey);

  const sendBuffer = (buffer: Buffer, filename: string) => {
    setContentType(res, filename);
    if (req.query.inline === "1") {
      res.setHeader("Content-Disposition", "inline");
    }
    res.send(buffer);
  };

  if (
    StorageService.shouldUsePrivateAccess() &&
    StorageService.isCloudProvider() &&
    !fs.existsSync(localPath)
  ) {
    res.status(403).json({ error: "ERR_MEDIA_PRIVATE_ACCESS_REQUIRED" });
    return;
  }

  if (fs.existsSync(localPath)) {
    if (req.query.inline === "1") {
      setContentType(res, localPath);
      res.setHeader("Content-Disposition", "inline");
      res.sendFile(localPath);
      return;
    }

    setContentType(res, localPath);
    res.sendFile(localPath);
    return;
  }

  const companyId = extractCompanyIdFromStorageKey(mediaKey);
  const buffer = await readMediaBuffer(
    normalizeStorageReference(mediaKey),
    companyId
  );

  if (!buffer?.length) {
    res.status(404).end();
    return;
  }

  sendBuffer(buffer, path.basename(mediaKey));
};
