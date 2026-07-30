import { analyzeImage } from "./ModelGateway";
import { extractTextFromBuffer } from "./DocumentParser";
import {
  extractStorageKeyFromUrl,
  readMediaBuffer
} from "../../helpers/mediaStorage";
import StorageService from "../StorageService/StorageService";
import MessageMediaFile from "../../models/MessageMediaFile";
import { logger } from "../../utils/logger";

const DEFAULT_BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export const buildPublicVisionMediaUrl = (mediaUrl: string): string => {
  if (mediaUrl.startsWith("http")) {
    const storageKey = extractStorageKeyFromUrl(mediaUrl);
    if (storageKey) {
      return `${DEFAULT_BACKEND_URL}/public/${storageKey}`;
    }
    return mediaUrl;
  }

  const publicUrl = StorageService.getPublicUrl(mediaUrl);
  return publicUrl.startsWith("http")
    ? publicUrl
    : `${DEFAULT_BACKEND_URL}${publicUrl}`;
};

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

export const resolveVisionImageSource = ({
  mediaUrl,
  mediaBuffer,
  mimeType
}: {
  mediaUrl: string;
  mediaBuffer?: Buffer;
  mimeType?: string;
}): string => {
  if (mediaBuffer && mediaBuffer.length > 0) {
    const normalizedMime =
      (mimeType || "image/jpeg").split(";")[0].trim() || "image/jpeg";
    return `data:${normalizedMime};base64,${mediaBuffer.toString("base64")}`;
  }

  return buildPublicVisionMediaUrl(mediaUrl);
};

const VISION_PROMPTS: Record<string, string> = {
  error_screen:
    "Esta imagem parece ser um print de erro ou tela de sistema. Descreva o erro, códigos, mensagens e contexto visível em português.",
  boleto:
    "Esta imagem parece ser um boleto ou cobrança. Extraia vencimento, valor, beneficiário, status e instruções visíveis, sem reproduzir a linha digitável completa.",
  receipt:
    "Esta imagem parece ser um comprovante. Extraia valor, data, status e dados relevantes, mascarando CPF, conta e identificadores sensíveis.",
  document:
    "Esta imagem contém um documento. Extraia todo o texto legível e descreva o tipo de documento.",
  equipment:
    "Esta imagem mostra equipamento. Descreva modelo, estado, problemas visíveis e contexto.",
  default:
    "Descreva objetivamente o conteúdo desta imagem em português. Se houver texto, transcreva-o."
};

const VISION_SAFETY_RULES =
  "Separe fatos visíveis de hipóteses. Não afirme a causa de um problema como certeza apenas pela imagem. Destaque mensagens e códigos úteis para consultar a base de conhecimento. Oculte senhas, tokens, códigos de autenticação, linha digitável completa e outros dados sensíveis na descrição.";

const detectImageContext = (caption?: string): string => {
  const text = (caption || "").toLowerCase();
  if (
    text.includes("erro") ||
    text.includes("error") ||
    text.includes("login") ||
    text.includes("senha")
  ) {
    return "error_screen";
  }
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

export const formatInboundImageContext = (
  caption: string,
  summary: string
): string => {
  const trimmedSummary = summary.trim();
  const trimmedCaption = caption.trim();

  if (!trimmedSummary) {
    return trimmedCaption;
  }

  const imageBlock = `[Imagem enviada pelo cliente]: ${trimmedSummary}`;
  return trimmedCaption ? `${trimmedCaption}\n\n${imageBlock}` : imageBlock;
};

export const analyzeAndPersistInboundImageVision = async ({
  companyId,
  ticketId,
  messageId,
  mediaUrl,
  imageBuffer,
  mimeType,
  caption,
  visionModel,
  providerId
}: {
  companyId: number;
  ticketId: number;
  messageId?: string;
  mediaUrl: string;
  imageBuffer: Buffer;
  mimeType?: string;
  caption?: string;
  visionModel?: string | null;
  providerId?: string;
}): Promise<string> => {
  const vision = await analyzeInboundImage({
    companyId,
    imageUrl: resolveVisionImageSource({
      mediaUrl,
      mediaBuffer: imageBuffer,
      mimeType
    }),
    visionModel: visionModel?.trim() || DEFAULT_VISION_MODEL,
    providerId,
    caption
  });

  const summary = vision.summary?.trim() || "";
  if (!summary || !messageId) {
    return summary;
  }

  try {
    const [updatedCount] = await MessageMediaFile.update(
      { visionSummary: summary },
      { where: { companyId, messageId, ticketId } }
    );

    if (!updatedCount) {
      const storageKey = mediaUrl.replace(/^\/public\//, "");
      await MessageMediaFile.update(
        { visionSummary: summary, messageId },
        { where: { companyId, ticketId, storageKey } }
      );
    }
  } catch (error) {
    logger.warn(
      { error, ticketId, messageId },
      "Failed to persist inbound image vision summary"
    );
  }

  return summary;
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
  visionModel?: string | null;
  providerId?: string;
  caption?: string;
}): Promise<VisionAnalysisResult> => {
  const resolvedVisionModel = visionModel?.trim() || DEFAULT_VISION_MODEL;
  const contextType = detectImageContext(caption);
  const prompt = `${
    VISION_PROMPTS[contextType] || VISION_PROMPTS.default
  }\n\n${VISION_SAFETY_RULES}`;

  logger.info(
    { companyId, imageUrl, contextType, visionModel: resolvedVisionModel },
    "AiVision: analyzing image"
  );

  const summary = await analyzeImage(
    companyId,
    imageUrl,
    resolvedVisionModel,
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
    const vision = await analyzeInboundImage({
      companyId,
      imageUrl: resolveVisionImageSource({
        mediaUrl,
        mediaBuffer: buffer,
        mimeType: normalizedMime
      }),
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
