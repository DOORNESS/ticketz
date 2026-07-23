import StorageService from "../StorageService/StorageService";
import { getSignedUrlTtlSeconds } from "../StorageService/storageEnv";
import MessageMediaFile from "../../models/MessageMediaFile";
import User from "../../models/User";
import {
  assertMediaAccess,
  buildMediaAccessToken,
  resolveStorageKeyFromMessage
} from "./MediaAuthorizationService";

const backendBaseUrl = (): string =>
  (process.env.BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");

export const buildClientMediaUrl = async ({
  media,
  user
}: {
  media: MessageMediaFile;
  user: User;
}): Promise<string> => {
  if (media.status !== "available" && media.status !== "pending") {
    return `${backendBaseUrl()}/media/unavailable/${media.id}`;
  }

  if (StorageService.shouldUsePrivateAccess()) {
    const expiresAtMs = Date.now() + getSignedUrlTtlSeconds() * 1000;
    const token = buildMediaAccessToken({
      mediaId: media.id,
      companyId: media.companyId,
      userId: user.id,
      expiresAtMs
    });
    return `${backendBaseUrl()}/media/access/${token}`;
  }

  return `${backendBaseUrl()}/public/${encodeURIComponent(media.storageKey)}`;
};

export const resolveMessageMediaUrls = async ({
  messages,
  user,
  companyId
}: {
  messages: Array<{
    id: string;
    mediaUrl?: string | null;
    setDataValue?: (key: string, value: unknown) => void;
    getDataValue?: (key: string) => unknown;
  }>;
  user: User;
  companyId: number;
}): Promise<void> => {
  const setMediaUrl = (
    message: {
      mediaUrl?: string | null;
      setDataValue?: (key: string, value: unknown) => void;
    },
    value: string | null
  ): void => {
    if (typeof message.setDataValue === "function") {
      message.setDataValue("mediaUrl", value);
      return;
    }
    message.mediaUrl = value;
  };

  await Promise.all(
    messages.map(async message => {
      const rawMediaUrl =
        typeof message.getDataValue === "function"
          ? (message.getDataValue("mediaUrl") as string | null)
          : message.mediaUrl;

      if (!rawMediaUrl) {
        return;
      }

      const storageKey = resolveStorageKeyFromMessage(rawMediaUrl);
      if (!storageKey) {
        return;
      }

      let media = await MessageMediaFile.findOne({
        where: { companyId, messageId: message.id }
      });

      if (!media) {
        media = await MessageMediaFile.findOne({
          where: { companyId, storageKey }
        });
      }

      if (!media) {
        if (StorageService.shouldUsePrivateAccess()) {
          setMediaUrl(message, null);
        }
        return;
      }

      try {
        await assertMediaAccess({
          user,
          mediaId: media.id,
          companyId
        });
        setMediaUrl(message, await buildClientMediaUrl({ media, user }));
      } catch {
        setMediaUrl(message, null);
      }
    })
  );
};

export const getSignedUrlForMedia = async (
  media: MessageMediaFile
): Promise<string> => {
  await StorageService.ensureReady(media.companyId);

  if (StorageService.shouldUsePrivateAccess()) {
    return StorageService.getSignedUrl(
      media.storageKey,
      media.companyId,
      getSignedUrlTtlSeconds()
    );
  }

  return StorageService.getPublicUrl(media.storageKey);
};

export const getSignedUrlForStorageKey = async (
  storageKey: string,
  companyId: number
): Promise<string> => {
  await StorageService.ensureReady(companyId);

  if (StorageService.shouldUsePrivateAccess()) {
    return StorageService.getSignedUrl(storageKey, companyId);
  }

  return StorageService.getPublicUrl(storageKey);
};
