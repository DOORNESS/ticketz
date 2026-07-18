import { getAIProvider } from "./providers/ProviderFactory";
import {
  ChatCompletionResult,
  ChatMessage,
  ProviderToolDefinition
} from "./providers/AIProvider";
import { transcribeAudioBuffer } from "./AudioTranscriptionService";

export type { ChatMessage, ChatCompletionResult };

export const createEmbedding = async (
  companyId: number,
  text: string,
  providerId?: string
): Promise<number[]> => {
  const provider = await getAIProvider(companyId, providerId);
  return provider.createEmbedding(text);
};

export const chatCompletion = async (
  companyId: number,
  {
    model,
    messages,
    temperature = 0.3,
    maxTokens = 1024,
    providerId,
    tools,
    toolChoice
  }: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    providerId?: string;
    tools?: ProviderToolDefinition[];
    toolChoice?: "auto" | "none";
  }
): Promise<ChatCompletionResult> => {
  const provider = await getAIProvider(companyId, providerId);
  return provider.chatCompletion({
    model,
    messages,
    temperature,
    maxTokens,
    tools,
    toolChoice
  });
};

export const transcribeAudio = async (
  companyId: number,
  audioBuffer: Buffer,
  filename: string,
  model = "gpt-4o-mini-transcribe",
  providerId?: string
): Promise<string> => {
  const result = await transcribeAudioBuffer({
    companyId,
    audioBuffer,
    filename,
    model,
    providerId
  });

  if (!result.success || !result.text) {
    throw new Error(result.errorReason || "audio_transcription_failed");
  }

  return result.text;
};

export const analyzeImage = async (
  companyId: number,
  imageUrl: string,
  model = "gpt-4o-mini",
  prompt = "Descreva objetivamente o conteúdo desta imagem em português.",
  providerId?: string
): Promise<string> => {
  const provider = await getAIProvider(companyId, providerId);
  return provider.analyzeImage(imageUrl, model, prompt);
};
