import { resolveKnowledgeStorageKey } from "../../../../../helpers/mediaStorage";
import StorageService from "../../../../StorageService/StorageService";
import { extractStructuredTextFromBuffer } from "../../../DocumentParser";
import {
  BaseAssetHandler,
  AssetExtractionContext,
  AssetExtractionResult
} from "../BaseAssetHandler";

const resolveStorageKey = (storageUrl: string): string =>
  resolveKnowledgeStorageKey(storageUrl);

export class TextAssetHandler extends BaseAssetHandler {
  readonly assetType = "text";

  async extract(
    context: AssetExtractionContext
  ): Promise<AssetExtractionResult> {
    if (context.rawText?.trim()) {
      return { text: context.rawText };
    }

    if (!context.storageUrl) {
      throw new Error("No text content available");
    }

    await StorageService.ensureReady(context.companyId);
    const buffer = await StorageService.download(
      resolveStorageKey(context.storageUrl),
      context.companyId
    );

    return { text: buffer.toString("utf-8") };
  }
}

export class MarkdownAssetHandler extends BaseAssetHandler {
  readonly assetType = "markdown";

  async extract(
    context: AssetExtractionContext
  ): Promise<AssetExtractionResult> {
    const textHandler = new TextAssetHandler();
    const result = await textHandler.extract(context);
    return { ...result, metadata: { format: "markdown" } };
  }
}

export class PdfAssetHandler extends BaseAssetHandler {
  readonly assetType = "pdf";

  async extract(
    context: AssetExtractionContext
  ): Promise<AssetExtractionResult> {
    if (!context.storageUrl) {
      throw new Error("PDF storageUrl is required");
    }

    await StorageService.ensureReady(context.companyId);
    const buffer = await StorageService.download(
      resolveStorageKey(context.storageUrl),
      context.companyId
    );
    const extracted = await extractStructuredTextFromBuffer(buffer, "pdf");
    return {
      text: extracted.text,
      metadata: {
        format: extracted.format,
        ...(extracted.pages ? { structuredPages: extracted.pages } : {})
      }
    };
  }
}

export class WordAssetHandler extends BaseAssetHandler {
  readonly assetType = "word";

  async extract(
    context: AssetExtractionContext
  ): Promise<AssetExtractionResult> {
    if (!context.storageUrl) {
      throw new Error("Word storageUrl is required");
    }

    await StorageService.ensureReady(context.companyId);
    const buffer = await StorageService.download(
      resolveStorageKey(context.storageUrl),
      context.companyId
    );
    const extracted = await extractStructuredTextFromBuffer(buffer, "docx");
    return { text: extracted.text, metadata: { format: extracted.format } };
  }
}

export class FaqAssetHandler extends BaseAssetHandler {
  readonly assetType = "faq";

  async extract(
    context: AssetExtractionContext
  ): Promise<AssetExtractionResult> {
    const question = String(context.metadata?.question || "").trim();
    const answer = String(
      context.metadata?.answer || context.rawText || ""
    ).trim();

    if (!question && !answer) {
      throw new Error("FAQ requires question/answer metadata or rawText");
    }

    const text = [`Q: ${question}`, `A: ${answer}`].filter(Boolean).join("\n");
    return { text, metadata: { question, answer } };
  }
}

export class UrlAssetHandler extends BaseAssetHandler {
  readonly assetType = "url";

  async extract(
    context: AssetExtractionContext
  ): Promise<AssetExtractionResult> {
    const url = String(
      context.metadata?.url || context.storageUrl || ""
    ).trim();
    if (!url) {
      throw new Error("URL asset requires metadata.url or storageUrl");
    }

    const axios = (await import("axios")).default;
    const response = await axios.get(url, {
      timeout: 15000,
      responseType: "text",
      maxContentLength: 2 * 1024 * 1024
    });

    const html = String(response.data || "");
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return { text, metadata: { url } };
  }
}
