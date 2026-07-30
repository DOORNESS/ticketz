import { analyzeImage } from "../ModelGateway";
import { analyzeInboundImage } from "../AiVisionOcrService";

jest.mock("../ModelGateway", () => ({
  analyzeImage: jest.fn(async () => "Erro 500 visível na tela.")
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
});
