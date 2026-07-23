import crypto from "crypto";
import mime from "mime-types";
import { makeRandomId } from "../../helpers/MakeRandomId";
import { getStorageKeyLayout } from "./storageEnv";

export type ObjectKeyInput = {
  companyId: number;
  filename: string;
  contentType?: string;
  folder?: string;
  ticketId?: number;
  messageId?: string;
  contactId?: number;
  assetId?: number;
  versionId?: number;
  repositoryItemId?: number;
};

const sanitizeExtension = (filename: string, contentType?: string): string => {
  const fromName = filename.includes(".")
    ? filename.split(".").pop()?.toLowerCase()
    : undefined;
  const ext =
    fromName && /^[a-z0-9]{1,8}$/.test(fromName)
      ? fromName
      : mime.extension(contentType || "") || "bin";
  return ext.replace(/[^a-z0-9]/gi, "") || "bin";
};

export const buildManagedObjectKey = (input: ObjectKeyInput): string => {
  const ext = sanitizeExtension(input.filename, input.contentType);
  const uuid = crypto.randomUUID();

  if (getStorageKeyLayout() === "legacy") {
    const folder = input.folder || "media";
    const ticketPart = input.ticketId ? `${input.ticketId}/` : "";
    const randomId = makeRandomId(12);
    return `suporte/${input.companyId}/${folder}/${ticketPart}${randomId}.${ext}`;
  }

  if (input.repositoryItemId) {
    return `companies/${input.companyId}/repository/${input.repositoryItemId}/${uuid}.${ext}`;
  }

  if (input.assetId && input.versionId) {
    return `companies/${input.companyId}/knowledge/${input.assetId}/${input.versionId}/${uuid}.${ext}`;
  }

  if (input.contactId) {
    return `companies/${input.companyId}/contacts/${input.contactId}/${uuid}.${ext}`;
  }

  if (input.ticketId && input.messageId) {
    return `companies/${input.companyId}/tickets/${input.ticketId}/messages/${input.messageId}/${uuid}.${ext}`;
  }

  if (input.ticketId) {
    return `companies/${input.companyId}/tickets/${input.ticketId}/${uuid}.${ext}`;
  }

  const folder = (input.folder || "media/attachments").replace(/^\/+|\/+$/g, "");
  return `companies/${input.companyId}/${folder}/${uuid}.${ext}`;
};

export const isManagedStorageKey = (key: string): boolean => {
  const normalized = key.replace(/^\/+/, "");
  return (
    normalized.startsWith("companies/") ||
    normalized.startsWith("suporte/") ||
    normalized.startsWith("persistent/")
  );
};
