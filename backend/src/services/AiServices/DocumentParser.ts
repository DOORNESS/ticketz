import fs from "fs";
import path from "path";
import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export const extractTextFromBuffer = async (
  buffer: Buffer,
  type: string,
  filename?: string
): Promise<string> => {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || type;

  if (ext === "pdf" || type === "pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (ext === "docx" || type === "docx") {
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
