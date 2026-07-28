import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const extractTextFromBuffer = async (
  buffer: Buffer,
  type: string,
  filename?: string
): Promise<string> => {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || type;

  if (ext === "pdf" || type === "pdf") {
    const data = new Uint8Array(buffer.byteLength);
    data.set(buffer);
    const parser = new PDFParse({ data });
    try {
      const parsed = await parser.getText();
      return parsed.text || "";
    } finally {
      await parser.destroy();
    }
  }

  if (ext === "docx" || type === "docx" || type === "word") {
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      throw new Error(
        "Arquivo DOCX inválido ou corrompido no storage — verifique upload B2 e reindexe"
      );
    }

    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (
    ["txt", "md", "markdown", "html", "text"].includes(ext) ||
    type === "text"
  ) {
    return buffer.toString("utf-8");
  }

  return buffer.toString("utf-8");
};

export const extractTextFromFilePath = async (
  filePath: string,
  type: string
): Promise<string> => {
  const buffer = fs.readFileSync(filePath);
  return extractTextFromBuffer(buffer, type, path.basename(filePath));
};
