import OpenAI from "openai";
import { Uploadable } from "openai/uploads";
import { bufferToReadStreamTmp } from "../../../helpers/bufferToReadStreamTmp";
import { GetCompanySetting } from "../../../helpers/CheckSettings";
import {
  AIProvider,
  AIProviderId,
  ChatCompletionParams,
  ChatCompletionResult,
  ToolCall
} from "./AIProvider";

const PROVIDER_BASE_URLS: Partial<Record<AIProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai"
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
    const requestMessages = params.messages.map(message => {
      if (message.role === "tool") {
        return {
          role: "tool" as const,
          tool_call_id: message.tool_call_id,
          content: message.content
        };
      }

      if (message.role === "assistant" && message.tool_calls?.length) {
        return {
          role: "assistant" as const,
          content: message.content || null,
          tool_calls: message.tool_calls.map(call => ({
            id: call.id,
            type: "function" as const,
            function: {
              name: call.name,
              arguments: call.arguments
            }
          }))
        };
      }

      return {
        role: message.role as "system" | "user" | "assistant",
        content: message.content
      };
    });

    const tools = params.tools?.length
      ? params.tools.map(tool => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        }))
      : undefined;

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages:
        requestMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 1024,
      ...(tools
        ? {
            tools,
            tool_choice: params.toolChoice || "auto"
          }
        : {})
    });

    const message = response.choices[0]?.message;
    const toolCalls: ToolCall[] | undefined = message?.tool_calls?.length
      ? message.tool_calls
          .filter(
            (
              call
            ): call is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
              type: "function";
            } => call.type === "function"
          )
          .map(call => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments
          }))
      : undefined;

    return {
      content: message?.content || "",
      tokensInput: response.usage?.prompt_tokens || 0,
      tokensOutput: response.usage?.completion_tokens || 0,
      model: response.model,
      toolCalls
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
    normalized === "gemini" ||
    normalized === "azure" ||
    normalized === "ollama" ||
    normalized === "custom"
  ) {
    return normalized as AIProviderId;
  }

  return "openai";
};

export const createOpenAICompatibleProvider = async (
  companyId: number,
  providerId?: string
): Promise<OpenAIProvider | null> => {
  const resolvedId = resolveProviderId(
    providerId || (await GetCompanySetting(companyId, "aiProvider", "openai"))
  );

  const apiKey =
    resolvedId === "gemini"
      ? (await GetCompanySetting(companyId, "geminiApiKey", null)) ||
        (await GetCompanySetting(companyId, "openAiKey", null))
      : await GetCompanySetting(companyId, "openAiKey", null);

  if (!apiKey) {
    return null;
  }

  const customBaseUrl = await GetCompanySetting(companyId, "aiBaseUrl", null);
  const baseURL =
    customBaseUrl ||
    PROVIDER_BASE_URLS[resolvedId] ||
    PROVIDER_BASE_URLS.openai;

  return new OpenAIProvider(resolvedId, apiKey, baseURL);
};
