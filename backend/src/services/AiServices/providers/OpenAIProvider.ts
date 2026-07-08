import OpenAI from "openai";
import { Uploadable } from "openai/uploads";
import { bufferToReadStreamTmp } from "../../../helpers/bufferToReadStreamTmp";
import { GetCompanySetting } from "../../../helpers/CheckSettings";
import {
  AIProvider,
  AIProviderId,
  ChatCompletionParams,
  ChatCompletionResult
} from "./AIProvider";

const PROVIDER_BASE_URLS: Partial<Record<AIProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1"
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export class OpenAIProvider implements AIProvider {
  readonly id: AIProviderId;

  private client: OpenAI;

  constructor(id: AIProviderId, apiKey: string, baseURL?: string) {
    this.id = id;
    this.client = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: parsePositiveInt(process.env.AI_PROVIDER_MAX_RETRIES, 1),
      timeout: parsePositiveInt(process.env.AI_PROVIDER_TIMEOUT_MS, 45000)
    });
  }

  async chatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 1024
    });

    return {
      content: response.choices[0]?.message?.content || "",
      tokensInput: response.usage?.prompt_tokens || 0,
      tokensOutput: response.usage?.completion_tokens || 0,
      model: response.model
    };
  }

  async createEmbedding(
    text: string,
    model = "text-embedding-3-small"
  ): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model,
      input: text
    });

    return response.data[0].embedding;
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    filename: string,
    model = "gpt-4o-mini-transcribe"
  ): Promise<string> {
    const file = bufferToReadStreamTmp(
      audioBuffer,
      filename?.split(".").pop() || "ogg"
    ) as Uploadable;

    const response = await this.client.audio.transcriptions.create({
      file,
      model
    });

    return response.text;
  }

  async analyzeImage(
    imageUrl: string,
    model = "gpt-4o-mini",
    prompt = "Descreva objetivamente o conteúdo desta imagem em português."
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500
    });

    return response.choices[0]?.message?.content || "";
  }
}

const resolveProviderId = (value: string): AIProviderId => {
  const normalized = value?.toLowerCase();

  if (
    normalized === "openai" ||
    normalized === "groq" ||
    normalized === "openrouter" ||
    normalized === "azure" ||
    normalized === "ollama" ||
    normalized === "custom"
  ) {
    return normalized;
  }

  return "openai";
};

export const createOpenAICompatibleProvider = async (
  companyId: number,
  providerId?: string
): Promise<OpenAIProvider | null> => {
  const apiKey = await GetCompanySetting(companyId, "openAiKey", null);
  if (!apiKey) {
    return null;
  }

  const resolvedId = resolveProviderId(
    providerId || (await GetCompanySetting(companyId, "aiProvider", "openai"))
  );

  const customBaseUrl = await GetCompanySetting(companyId, "aiBaseUrl", null);
  const baseURL =
    customBaseUrl ||
    PROVIDER_BASE_URLS[resolvedId] ||
    PROVIDER_BASE_URLS.openai;

  return new OpenAIProvider(resolvedId, apiKey, baseURL);
};
