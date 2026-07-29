import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { StructuredPage } from "./ChunkingService";

export type ExtractedDocumentText = {
  text: string;
  pages?: StructuredPage[];
  format: string;
};

export const extractStructuredTextFromBuffer = async (
  buffer: Buffer,
  type: string,
  filename?: string
): Promise<ExtractedDocumentText> => {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || type;

  if (ext === "pdf" || type === "pdf") {
    const data = new Uint8Array(buffer.byteLength);
    data.set(buffer);
    const parser = new PDFParse({ data });
    try {
      const parsed = await parser.getText();
      const parsedPages = (
        parsed as unknown as {
          pages?: Array<{ text?: string; pageNumber?: number; num?: number }>;
        }
      ).pages;
      const pages = Array.isArray(parsedPages)
        ? parsedPages
            .map((page, index) => ({
              pageNumber: page.pageNumber || page.num || index + 1,
              text: String(page.text || "").trim()
            }))
            .filter(page => Boolean(page.text))
        : [];

      return {
        text: parsed.text || pages.map(page => page.text).join("\f"),
        pages: pages.length ? pages : undefined,
        format: "pdf"
      };
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
    return { text: result.value || "", format: "docx" };
  }

  if (
    ["txt", "md", "markdown", "html", "text"].includes(ext) ||
    type === "text"
  ) {
    return { text: buffer.toString("utf-8"), format: ext || "text" };
  }

  return { text: buffer.toString("utf-8"), format: ext || type || "text" };
};

export const extractTextFromBuffer = async (
  buffer: Buffer,
  type: string,
  filename?: string
): Promise<string> => {
  const extracted = await extractStructuredTextFromBuffer(
    buffer,
    type,
    filename
  );
  return extracted.text;
};

export const extractTextFromFilePath = async (
  filePath: string,
  type: string
): Promise<string> => {
  const buffer = fs.readFileSync(filePath);
  return extractTextFromBuffer(buffer, type, path.basename(filePath));
};
