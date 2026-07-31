import fs from "fs";
import os from "os";
import path from "path";
import { getMessageFileOptions } from "../../WbotServices/SendWhatsAppMedia";

jest.mock("../../WbotServices/wbotMessageListener", () => ({
  verifyMediaMessage: jest.fn(),
  verifyMessage: jest.fn()
}));
jest.mock("../../../helpers/GetTicketWbot", () => jest.fn());
jest.mock("../../../helpers/CheckSettings", () => jest.fn());
jest.mock("../../../helpers/saveMediaFile", () => jest.fn());

describe("getMessageFileOptions repository media buffers", () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "ticketz-media-test-")
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  });

  it.each([
    ["image", "logo.png", "image/png", "image"],
    ["pdf", "manual.pdf", "application/pdf", "document"],
    [
      "document",
      "orientacao.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "document"
    ],
    ["file", "dados.zip", "application/zip", "document"]
  ])(
    "loads %s content before returning WhatsApp options",
    async (_, fileName, mimetype, mediaProperty) => {
      const filePath = path.join(tempDirectory, fileName);
      const content = Buffer.from(`content-${fileName}`);
      await fs.promises.writeFile(filePath, Uint8Array.from(content));

      const options = (await getMessageFileOptions(
        fileName,
        filePath,
        mimetype
      )) as unknown as Record<string, unknown>;

      expect(Buffer.isBuffer(options[mediaProperty])).toBe(true);
      expect(options[mediaProperty]).toEqual(content);
      expect(options.fileName).toBe(fileName);
      if (mediaProperty === "document") {
        expect(options.mimetype).toBe(mimetype);
      }
    }
  );
});
