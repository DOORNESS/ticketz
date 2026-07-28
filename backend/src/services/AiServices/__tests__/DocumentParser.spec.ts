const mockGetText = jest.fn();
const mockDestroy = jest.fn();
const mockPDFParse = jest.fn().mockImplementation(() => ({
  getText: mockGetText,
  destroy: mockDestroy
}));

jest.mock("pdf-parse", () => ({
  PDFParse: mockPDFParse
}));

import { extractTextFromBuffer } from "../DocumentParser";

describe("DocumentParser PDF v2 adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetText.mockResolvedValue({ text: "Recuperação de senha por CPF" });
    mockDestroy.mockResolvedValue(undefined);
  });

  it("uses PDFParse v2 and releases parser resources", async () => {
    const buffer = Buffer.from("%PDF-1.7 test");

    await expect(extractTextFromBuffer(buffer, "pdf")).resolves.toBe(
      "Recuperação de senha por CPF"
    );
    expect(mockPDFParse).toHaveBeenCalledWith({
      data: expect.any(Uint8Array)
    });
    expect(mockGetText).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("releases parser resources when extraction fails", async () => {
    mockGetText.mockRejectedValueOnce(new Error("invalid pdf"));

    await expect(
      extractTextFromBuffer(Buffer.from("invalid"), "pdf")
    ).rejects.toThrow("invalid pdf");
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
