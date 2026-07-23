import User from "../../../models/User";
import MessageMediaFile from "../../../models/MessageMediaFile";
import Ticket from "../../../models/Ticket";
import AppError from "../../../errors/AppError";
import {
  assertMediaAccess,
  assertPermanentDeletePermission,
  buildMediaAccessToken,
  parseMediaAccessToken,
  resolveStorageKeyFromMessage
} from "../MediaAuthorizationService";
import {
  buildClientMediaUrl,
  getSignedUrlForMedia
} from "../MediaAccessService";
import {
  deleteStoredMediaObject,
  findExpiredConversationMedia
} from "../MediaDeleteObjectService";
import StorageService from "../../StorageService/StorageService";

jest.mock("../../StorageService/StorageService", () => ({
  __esModule: true,
  default: {
    ensureReady: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/object"),
    shouldUsePrivateAccess: jest.fn().mockReturnValue(true),
    isCloudProvider: jest.fn().mockReturnValue(true),
    getProvider: jest.fn().mockReturnValue("backblaze"),
    getBucketName: jest.fn().mockReturnValue("ticketz-media"),
    exists: jest.fn().mockResolvedValue(false)
  }
}));

jest.mock("../../../models/MessageMediaFile");
jest.mock("../../../models/Ticket");
jest.mock("../../../helpers/canViewTicket", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(true),
  canViewTicket: jest.fn().mockReturnValue(true)
}));

describe("Media lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.B2_USE_PRIVATE_ACCESS = "true";
    process.env.BACKEND_URL = "http://localhost:8080";
  });

  it("resolves storage key from legacy and companies paths", () => {
    expect(
      resolveStorageKeyFromMessage(
        "companies/2/tickets/9/messages/abc/file.jpg"
      )
    ).toBe("companies/2/tickets/9/messages/abc/file.jpg");

    expect(
      resolveStorageKeyFromMessage("/public/suporte/2/media/images/x.png")
    ).toBe("suporte/2/media/images/x.png");
  });

  it("builds and validates media access token", () => {
    const token = buildMediaAccessToken({
      mediaId: 10,
      companyId: 2,
      userId: 5,
      expiresAtMs: Date.now() + 60_000
    });

    const parsed = parseMediaAccessToken(token);
    expect(parsed?.mediaId).toBe(10);
    expect(parsed?.companyId).toBe(2);
    expect(parsed?.userId).toBe(5);
  });

  it("rejects expired media access token", () => {
    const token = buildMediaAccessToken({
      mediaId: 10,
      companyId: 2,
      userId: 5,
      expiresAtMs: Date.now() - 1_000
    });

    expect(parseMediaAccessToken(token)).toBeNull();
  });

  it("denies permanent delete for non-admin users", () => {
    expect(() =>
      assertPermanentDeletePermission({ profile: "user", super: false } as User)
    ).toThrow(AppError);
  });

  it("allows permanent delete for admin users", () => {
    expect(() =>
      assertPermanentDeletePermission({ profile: "admin", super: false } as User)
    ).not.toThrow();
  });

  it("builds private client media URL with backend token endpoint", async () => {
    const media = {
      id: 99,
      companyId: 2,
      status: "available"
    } as MessageMediaFile;

    const user = { id: 7 } as User;
    const url = await buildClientMediaUrl({ media, user });

    expect(url).toContain("/media/access/");
    expect(url).not.toContain("backblazeb2.com");
  });

  it("returns unavailable endpoint for deleted media", async () => {
    const media = {
      id: 12,
      companyId: 2,
      status: "deleted"
    } as MessageMediaFile;

    const url = await buildClientMediaUrl({ media, user: { id: 1 } as User });
    expect(url).toContain("/media/unavailable/12");
  });

  it("generates signed URL through storage service", async () => {
    const media = {
      companyId: 2,
      storageKey: "companies/2/tickets/1/messages/a/uuid.jpg",
      status: "available"
    } as MessageMediaFile;

    const url = await getSignedUrlForMedia(media);
    expect(StorageService.getSignedUrl).toHaveBeenCalled();
    expect(url).toBe("https://signed.example/object");
  });

  it("treats missing object as successful idempotent delete", async () => {
    (StorageService.delete as jest.Mock).mockRejectedValueOnce(
      new Error("NoSuchKey")
    );

    const media = {
      id: 1,
      companyId: 2,
      storageKey: "companies/2/tickets/1/messages/a/uuid.jpg",
      status: "available",
      sizeBytes: 100,
      deleteAttempts: 0,
      update: jest.fn().mockResolvedValue(undefined)
    } as unknown as MessageMediaFile;

    const result = await deleteStoredMediaObject(media);
    expect(result.removed).toBe(true);
  });

  it("queries expired conversation media with retention filter", async () => {
    (MessageMediaFile.findAll as jest.Mock).mockResolvedValueOnce([]);
    await findExpiredConversationMedia(500);

    expect(MessageMediaFile.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          retentionExempt: false
        }),
        limit: 500
      })
    );
  });

  it("blocks cross-company media access", async () => {
    (MessageMediaFile.findOne as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      assertMediaAccess({
        user: { id: 1, profile: "admin", super: false } as User,
        mediaId: 1,
        companyId: 3
      })
    ).rejects.toMatchObject({ message: "ERR_MEDIA_NOT_FOUND" });
  });

  it("does not expose credentials in token signature material", () => {
    const token = buildMediaAccessToken({
      mediaId: 1,
      companyId: 2,
      userId: 3,
      expiresAtMs: Date.now() + 1000
    });

    expect(token).not.toMatch(/B2_APPLICATION_KEY/);
    expect(token).not.toMatch(/K005/);
  });
});

describe("objectKeyBuilder", () => {
  it("sanitizes unsafe filename segments", () => {
    const { buildManagedObjectKey } = require("../../StorageService/objectKeyBuilder");
    const key = buildManagedObjectKey({
      companyId: 2,
      ticketId: 9,
      messageId: "msg-1",
      filename: "../../etc/passwd",
      contentType: "image/png"
    });

    expect(key).toContain("companies/2/tickets/9/messages/msg-1/");
    expect(key).not.toContain("..");
    expect(key.endsWith(".png") || key.endsWith(".bin")).toBe(true);
  });
});
