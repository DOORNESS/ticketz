import path from "path";
import fs from "fs";
import mime from "mime-types";
import { Request, Response } from "express";
import uploadConfig from "../config/upload";
import { readMediaBuffer, normalizeStorageReference } from "./mediaStorage";

const parseCompanyIdFromKey = (mediaKey: string): number => {
  const first = mediaKey.split("/")[0];
  const id = parseInt(first, 10);
  return Number.isFinite(id) && id > 0 ? id : 1;
};

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

  const companyId = parseCompanyIdFromKey(mediaKey);
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
