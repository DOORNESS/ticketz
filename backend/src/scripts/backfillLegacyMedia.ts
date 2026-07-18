/**
 * Backfill legacy local media metadata into MessageMediaFiles.
 *
 * Usage:
 *   COMPANY_ID=<id> npm run backfill:legacy-media [-- --dry-run]
 */
import "../bootstrap";
import fs from "fs";
import path from "path";
import sequelize from "../database";
import Message from "../models/Message";
import { getPublicPath } from "../helpers/GetPublicPath";
import { persistUnifiedMediaFile } from "../services/AiServices/media/UnifiedMediaPersistenceService";

const companyId = Number(process.env.COMPANY_ID);
const dryRun = process.argv.includes("--dry-run");

if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error("COMPANY_ID env var is required");
  process.exit(1);
}

(async () => {
  await sequelize.authenticate();

  const messages = await Message.findAll({
    where: { companyId },
    attributes: ["id", "ticketId", "mediaUrl", "mediaType", "companyId"],
    limit: 5000,
    order: [["id", "DESC"]]
  });

  let scanned = 0;
  let persisted = 0;

  for (const message of messages) {
    if (!message.mediaUrl || message.mediaUrl.startsWith("http")) {
      continue;
    }

    scanned += 1;
    const localPath = path.join(getPublicPath(), message.mediaUrl);
    if (!fs.existsSync(localPath)) continue;

    const stats = fs.statSync(localPath);
    const payload = {
      companyId,
      ticketId: message.ticketId,
      messageId: String(message.id),
      mediaType: message.mediaType || "attachment",
      mimeType: "application/octet-stream",
      filename: path.basename(localPath),
      storageKey: message.mediaUrl.replace(/^\/public\//, ""),
      publicUrl: message.mediaUrl,
      sizeBytes: stats.size,
      direction: "inbound" as const
    };

    if (!dryRun) {
      await persistUnifiedMediaFile(payload);
    }
    persisted += 1;
  }

  console.log({ scanned, persisted, dryRun });
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
