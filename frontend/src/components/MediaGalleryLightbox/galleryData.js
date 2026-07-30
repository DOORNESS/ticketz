const buildCacheBustedUrl = (url, seed) => {
  if (!url) {
    return url;
  }

  const cacheBuster = seed || Date.now();
  try {
    const parsedUrl = new URL(url, window.location.origin);
    parsedUrl.searchParams.set("cb", `${cacheBuster}`);
    return parsedUrl.toString();
  } catch (error) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}cb=${cacheBuster}`;
  }
};

const extractFileName = (url, fallback) => {
  if (!url) {
    return fallback;
  }

  try {
    const parsedUrl = new URL(url, window.location.origin);
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts.pop() || fallback);
  } catch (error) {
    const parts = url.split("?")[0].split("/").filter(Boolean);
    return decodeURIComponent(parts.pop() || fallback);
  }
};

const VIDEO_THUMBNAIL_FALLBACK = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#0f172a"/><circle cx="160" cy="90" r="42" fill="#ffffff" fill-opacity="0.92"/><polygon points="148,68 148,112 186,90" fill="#0f172a"/></svg>'
)}`;

export const buildMediaGalleryData = (
  messages,
  {
    getId = message => message?.id,
    getMediaType = message => message?.mediaType,
    getMediaUrl = message => message?.mediaUrl,
    getThumbnailUrl = message => message?.thumbnailUrl,
    getDescription = message => message?.body,
    getUpdatedAt = message => message?.updatedAt,
    getCreatedAt = message => message?.createdAt,
    getDataJson = message => message?.dataJson
  } = {}
) => {
  return messages.reduce(
    (acc, message) => {
      const messageId = getId(message);
      const mediaType = getMediaType(message);
      const mediaUrl = getMediaUrl(message);

      if (!mediaUrl || !["image", "video"].includes(mediaType)) {
        return acc;
      }

      let data = null;
      try {
        const rawData = getDataJson(message);
        data = rawData ? JSON.parse(rawData) : null;
      } catch (error) {
        data = null;
      }

      const isSticker = !!(data?.message && "stickerMessage" in data.message);
      if (isSticker) {
        return acc;
      }

      const whatsappThumbnail =
        data?.message?.imageMessage?.jpegThumbnail ||
        data?.message?.videoMessage?.jpegThumbnail;
      const thumbnailUrl =
        getThumbnailUrl(message) ||
        (whatsappThumbnail
          ? `data:image/jpeg;base64,${whatsappThumbnail}`
          : null);
      const description = getDescription(message) || undefined;
      const cacheSeed =
        getUpdatedAt(message) || getCreatedAt(message) || messageId;
      const freshMediaUrl = buildCacheBustedUrl(mediaUrl, cacheSeed);

      acc.byMessageId[messageId] = acc.slides.length;

      if (mediaType === "video") {
        acc.slides.push({
          key: `${messageId}`,
          type: "video",
          width: 1280,
          height: 720,
          autoPlay: true,
          controls: true,
          description,
          thumbnail: thumbnailUrl || VIDEO_THUMBNAIL_FALLBACK,
          poster: thumbnailUrl || freshMediaUrl,
          download: {
            url: freshMediaUrl,
            filename: extractFileName(mediaUrl, `video-${messageId}`)
          },
          sources: [{ src: freshMediaUrl }]
        });
      } else {
        acc.slides.push({
          key: `${messageId}`,
          src: freshMediaUrl,
          thumbnail: thumbnailUrl || freshMediaUrl,
          description,
          download: {
            url: freshMediaUrl,
            filename: extractFileName(mediaUrl, `image-${messageId}`)
          }
        });
      }

      return acc;
    },
    { slides: [], byMessageId: {} }
  );
};
