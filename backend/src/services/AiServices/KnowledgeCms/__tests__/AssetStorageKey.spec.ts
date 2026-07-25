import {
  TextAssetHandler,
  WordAssetHandler
} from "../ingestion/handlers";

jest.mock("../../../StorageService/StorageService", () => ({
  __esModule: true,
  default: {
    ensureReady: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue(Buffer.from("docx-text"))
  }
}));

jest.mock("../../DocumentParser", () => ({
  extractTextFromBuffer: jest.fn().mockResolvedValue("extracted word text")
}));

describe("CMS asset storage key resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("downloads using full companies/ path from public B2 URL", async () => {
    const StorageService = (
      await import("../../../StorageService/StorageService")
    ).default;
    const handler = new WordAssetHandler();

    await handler.extract({
      companyId: 1,
      storageUrl:
        "https://s3.example.com/bucket/companies/1/knowledge/documents/help.docx"
    });

    expect(StorageService.download).toHaveBeenCalledWith(
      "companies/1/knowledge/documents/help.docx",
      1
    );
  });

  it("normalizes raw storage keys without URL scheme", async () => {
    const StorageService = (
      await import("../../../StorageService/StorageService")
    ).default;
    const handler = new TextAssetHandler();

    await handler.extract({
      companyId: 1,
      storageUrl: "/public/companies/1/knowledge/text/manual.txt"
    });

    expect(StorageService.download).toHaveBeenCalledWith(
      "companies/1/knowledge/text/manual.txt",
      1
    );
  });
});
