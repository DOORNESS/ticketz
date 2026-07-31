jest.mock("../../WbotServices/SendWhatsAppMedia", () => jest.fn());
jest.mock("../../WbotServices/SendWhatsAppMessage", () => jest.fn());
jest.mock("../../StorageService/StorageService", () => ({
  __esModule: true,
  default: {
    download: jest.fn()
  }
}));
jest.mock("../../AiServices/Triage/AiTicketTimelineService", () => ({
  logAiTicketTimelineEvent: jest.fn()
}));
jest.mock("../ContentRepositoryService", () => ({
  getRepositoryItem: jest.fn(),
  recordRepositoryUsage: jest.fn(),
  canAccessRepositoryItem: jest.fn(() => true),
  resolveRepositoryMime: jest.fn(() => "text/plain"),
  buildRepositoryAccessForTicket: jest.fn(() => ({
    userId: 7,
    profile: "user",
    companyId: 1,
    queueIds: []
  }))
}));

import sendRepositoryItemToTicket from "../SendContentRepositoryItemService";
import {
  getRepositoryItem,
  recordRepositoryUsage
} from "../ContentRepositoryService";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import AppError from "../../../errors/AppError";
import StorageService from "../../StorageService/StorageService";
import SendWhatsAppMedia from "../../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../../WbotServices/SendWhatsAppMessage";
import fs from "fs";

jest.mock("../../../models/Ticket");
jest.mock("../../../models/User");

describe("SendContentRepositoryItemService", () => {
  const item = {
    id: 5,
    companyId: 1,
    contentType: "text",
    active: true,
    allowHumanUse: true,
    useForDelivery: true,
    description: "Hello",
    usageCount: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getRepositoryItem as jest.Mock).mockResolvedValue(item);
    (Ticket.findOne as jest.Mock).mockResolvedValue({
      id: 9,
      companyId: 1,
      status: "open",
      channel: "whatsapp",
      contact: {},
      whatsapp: {}
    });
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: 7,
      queues: []
    });
    (SendWhatsAppMessage as jest.Mock).mockResolvedValue(undefined);
    (SendWhatsAppMedia as jest.Mock).mockResolvedValue(undefined);
    (StorageService.download as jest.Mock).mockResolvedValue(
      Buffer.from("repository-file")
    );
    (recordRepositoryUsage as jest.Mock).mockResolvedValue(undefined);
  });

  it("sends text repository item and records usage", async () => {
    const result = await sendRepositoryItemToTicket({
      companyId: 1,
      ticketId: 9,
      itemId: 5,
      userId: 7,
      profile: "user"
    });

    expect(result.messageType).toBe("text");
    expect(SendWhatsAppMessage).toHaveBeenCalled();
    expect(recordRepositoryUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "human",
        ticketId: 9,
        userId: 7
      })
    );
  });

  it("blocks send on closed ticket", async () => {
    (Ticket.findOne as jest.Mock).mockResolvedValue({
      id: 9,
      companyId: 1,
      status: "closed"
    });

    await expect(
      sendRepositoryItemToTicket({
        companyId: 1,
        ticketId: 9,
        itemId: 5,
        userId: 7,
        profile: "user"
      })
    ).rejects.toMatchObject({ message: "ERR_TICKET_CLOSED" });
  });

  it.each([
    ["image", "logo.png", "image/png"],
    ["pdf", "manual.pdf", "application/pdf"],
    [
      "document",
      "orientacao.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    ["file", "dados.zip", "application/zip"]
  ])(
    "sends %s repository content with the correct media metadata",
    async (contentType, originalFileName, mimetype) => {
      (getRepositoryItem as jest.Mock).mockResolvedValue({
        ...item,
        contentType,
        storageKey: `repository/${originalFileName}`,
        originalFileName,
        mimeType: mimetype,
        description: ""
      });
      const { resolveRepositoryMime } = jest.requireMock(
        "../ContentRepositoryService"
      );
      resolveRepositoryMime.mockReturnValue(mimetype);
      let temporaryPath = "";
      (SendWhatsAppMedia as jest.Mock).mockImplementation(async ({ media }) => {
        temporaryPath = media.path;
        expect(fs.existsSync(media.path)).toBe(true);
        expect(media.originalname).toBe(originalFileName);
        expect(media.mimetype).toBe(mimetype);
      });

      const result = await sendRepositoryItemToTicket({
        companyId: 1,
        ticketId: 9,
        itemId: 5,
        userId: 7,
        profile: "user"
      });

      expect(result.messageType).toBe("media");
      expect(SendWhatsAppMedia).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(temporaryPath)).toBe(false);
      expect(recordRepositoryUsage).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, ticketId: 9 })
      );
    }
  );

  it("retries media delivery while the WhatsApp connection recovers", async () => {
    (getRepositoryItem as jest.Mock).mockResolvedValue({
      ...item,
      contentType: "image",
      storageKey: "repository/logo.png",
      originalFileName: "logo.png",
      mimeType: "image/png",
      description: ""
    });
    (SendWhatsAppMedia as jest.Mock)
      .mockRejectedValueOnce(new AppError("ERR_SENDING_WAPP_MSG", 400))
      .mockResolvedValueOnce(undefined);
    const timeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(callback => {
        callback();
        return 0 as unknown as NodeJS.Timeout;
      });

    await expect(
      sendRepositoryItemToTicket({
        companyId: 1,
        ticketId: 9,
        itemId: 5,
        userId: 7,
        profile: "user"
      })
    ).resolves.toMatchObject({ messageType: "media" });

    expect(SendWhatsAppMedia).toHaveBeenCalledTimes(2);
    timeoutSpy.mockRestore();
  });
});
