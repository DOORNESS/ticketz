import { buildMediaGalleryData } from "./galleryData";

describe("buildMediaGalleryData", () => {
  it("keeps authenticated blob URLs intact for the full-size lightbox", () => {
    const objectUrl = "blob:https://suporte.fortmax.com.br/media-object-id";
    const gallery = buildMediaGalleryData([
      {
        id: "message-1",
        mediaType: "image",
        mediaUrl: objectUrl,
        updatedAt: "2026-07-30T20:00:00.000Z"
      }
    ]);

    expect(gallery.slides[0].src).toBe(objectUrl);
    expect(gallery.slides[0].download.url).toBe(objectUrl);
  });

  it("cache-busts regular HTTP media URLs", () => {
    const gallery = buildMediaGalleryData([
      {
        id: "message-2",
        mediaType: "image",
        mediaUrl: "https://api.fortmax.com.br/public/image.jpeg",
        updatedAt: "2026-07-30T20:00:00.000Z"
      }
    ]);

    expect(gallery.slides[0].src).toContain("cb=");
  });
});
