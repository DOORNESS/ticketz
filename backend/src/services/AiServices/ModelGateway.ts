import OpenAI from "openai";
import { bufferToReadStreamTmp } from "../../helpers/bufferToReadStreamTmp";
import { Uploadable } from "openai/uploads";
import { GetCompanySetting } from "../../helpers/CheckSettings";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
};

export const getOpenAiClient = async (
  companyId: number
): Promise<OpenAI | null> => {
  const apiKey = await GetCompanySetting(companyId, "openAiKey", null);
  if (!apiKey) {
    return null;
  }

  const provider = await GetCompanySetting(companyId, "aiProvider", "openai");
  const baseURL =
    provider === "groq" ? "https://api.groq.com/openai/v1" : undefined;

  return new OpenAI({ apiKey, baseURL });
};

export const createEmbedding = async (
  companyId: number,
  text: string
): Promise<number[]> => {
  const client = await getOpenAiClient(companyId);
  if (!client) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });

  return response.data[0].embedding;
};

export const chatCompletion = async (
  companyId: number,
  {
    model,
    messages,
    temperature = 0.3,
    maxTokens = 1024
  }: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ChatCompletionResult> => {
  const client = await getOpenAiClient(companyId);
  if (!client) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  });

  return {
    content: response.choices[0]?.message?.content || "",
    tokensInput: response.usage?.prompt_tokens || 0,
    tokensOutput: response.usage?.completion_tokens || 0,
    model: response.model
  };
};

export const transcribeAudio = async (
  companyId: number,
  audioBuffer: Buffer,
  filename: string,
  model = "gpt-4o-mini-transcribe"
): Promise<string> => {
  const client = await getOpenAiClient(companyId);
  if (!client) {
    throw new Error("OpenAI API key not configured");
  }

  const file = bufferToReadStreamTmp(
    audioBuffer,
    filename?.split(".").pop() || "ogg"
  ) as Uploadable;

  const response = await client.audio.transcriptions.create({
    file,
    model
  });

  return response.text;
};

export const analyzeImage = async (
  companyId: number,
  imageUrl: string,
  model = "gpt-4o-mini",
  prompt = "Descreva objetivamente o conteúdo desta imagem em português."
): Promise<string> => {
  const client = await getOpenAiClient(companyId);
  if (!client) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await client.chat.completions.create({
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
};
