import { analyzeImage } from "./ModelGateway";
import { extractTextFromBuffer } from "./DocumentParser";
import { readMediaBuffer } from "../../helpers/mediaStorage";
import { logger } from "../../utils/logger";

const VISION_PROMPTS: Record<string, string> = {
  error_screen:
    "Esta imagem parece ser um print de erro ou tela de sistema. Descreva o erro, códigos, mensagens e contexto visível em português.",
  boleto:
    "Esta imagem parece ser um boleto ou cobrança. Extraia vencimento, valor, beneficiário, linha digitável e instruções visíveis.",
  receipt:
    "Esta imagem parece ser um comprovante. Extraia valor, data, origem, destino e demais dados relevantes.",
  document:
    "Esta imagem contém um documento. Extraia todo o texto legível e descreva o tipo de documento.",
  equipment:
    "Esta imagem mostra equipamento. Descreva modelo, estado, problemas visíveis e contexto.",
  default:
    "Descreva objetivamente o conteúdo desta imagem em português. Se houver texto, transcreva-o."
};

const detectImageContext = (caption?: string): string => {
  const text = (caption || "").toLowerCase();
  if (text.includes("erro") || text.includes("error")) return "error_screen";
  if (text.includes("boleto")) return "boleto";
  if (text.includes("comprovante") || text.includes("pix")) return "receipt";
  if (text.includes("documento") || text.includes("rg") || text.includes("cpf"))
    return "document";
  if (text.includes("equip") || text.includes("aparelho")) return "equipment";
  return "default";
};

export type VisionAnalysisResult = {
  summary: string;
  contextType: string;
  usedVision: boolean;
  imageUrl: string;
};

export const analyzeInboundImage = async ({
  companyId,
  imageUrl,
  visionModel,
  providerId,
  caption
}: {
  companyId: number;
  imageUrl: string;
  visionModel: string;
  providerId?: string;
  caption?: string;
}): Promise<VisionAnalysisResult> => {
  const contextType = detectImageContext(caption);
  const prompt = VISION_PROMPTS[contextType] || VISION_PROMPTS.default;

  logger.info(
    { companyId, imageUrl, contextType, visionModel },
    "AiVision: analyzing image"
  );

  const summary = await analyzeImage(
    companyId,
    imageUrl,
    visionModel,
    prompt,
    providerId
  );

  logger.info(
    { companyId, contextType, summaryLength: summary?.length || 0 },
    "AiVision: analysis complete"
  );

  return {
    summary: summary || "",
    contextType,
    usedVision: true,
    imageUrl
  };
};

export const extractTextFromStoredMedia = async ({
  companyId,
  mediaUrl,
  mimeType,
  filename
}: {
  companyId: number;
  mediaUrl: string;
  mimeType?: string;
  filename?: string;
}): Promise<{ text: string; method: string }> => {
  const buffer = await readMediaBuffer(mediaUrl, companyId);
  if (!buffer) {
    return { text: "", method: "none" };
  }

  const normalizedMime = (mimeType || "").toLowerCase();
  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";

  if (
    normalizedMime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
  ) {
    const publicUrl = mediaUrl.startsWith("http")
      ? mediaUrl
      : `${process.env.BACKEND_URL || "http://localhost:8080"}/public/${mediaUrl.replace(/^\/public\//, "")}`;

    const vision = await analyzeInboundImage({
      companyId,
      imageUrl: publicUrl,
      visionModel: "gpt-4o-mini",
      caption: "documento com texto"
    });

    return { text: vision.summary, method: "vision_ocr" };
  }

  if (
    normalizedMime === "application/pdf" ||
    ext === "pdf" ||
    ["docx", "txt", "md", "html"].includes(ext)
  ) {
    const text = await extractTextFromBuffer(
      buffer,
      ext || normalizedMime.split("/").pop() || "txt",
      filename
    );
    return { text: text || "", method: "document_parser" };
  }

  return { text: "", method: "unsupported" };
};
