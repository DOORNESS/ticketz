import { analyzeImage } from "../ModelGateway";
import {
  analyzeInboundImage,
  resolveVisionImageSource
} from "../AiVisionOcrService";

jest.mock("../ModelGateway", () => ({
  analyzeImage: jest.fn(async () => "Erro 500 visível na tela.")
}));

jest.mock("../../StorageService/StorageService", () => ({
  __esModule: true,
  default: {
    shouldUsePrivateAccess: jest.fn(() => false),
    getPublicUrl: jest.fn((key: string) => `/public/${key}`)
  }
}));

const mockedAnalyzeImage = analyzeImage as jest.MockedFunction<
  typeof analyzeImage
>;

describe("AiVisionOcrService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("analyzes an error screenshot with uncertainty and privacy guards", async () => {
    const result = await analyzeInboundImage({
      companyId: 1,
      imageUrl: "https://example.test/error.jpg",
      visionModel: "gpt-4o-mini",
      providerId: "openai",
      caption: "aparece este erro"
    });

    expect(result.summary).toBe("Erro 500 visível na tela.");
    expect(result.contextType).toBe("error_screen");
    expect(mockedAnalyzeImage).toHaveBeenCalledWith(
      1,
      "https://example.test/error.jpg",
      "gpt-4o-mini",
      expect.stringMatching(/hipóteses.*Não afirme.*dados sensíveis/is),
      "openai"
    );
  });

  it("uses base64 data URL for private storage when buffer is available", async () => {
    const StorageService = require("../../StorageService/StorageService")
      .default as { shouldUsePrivateAccess: jest.Mock };

    StorageService.shouldUsePrivateAccess.mockReturnValue(true);

    const buffer = Buffer.from("fake-image");
    const imageUrl = resolveVisionImageSource({
      mediaUrl: "companies/1/messages/photo.jpg",
      mediaBuffer: buffer,
      mimeType: "image/png"
    });

    expect(imageUrl).toBe(
      `data:image/png;base64,${buffer.toString("base64")}`
    );
  });
});
