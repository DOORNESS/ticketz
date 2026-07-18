export type AIProviderId =
  | "openai"
  | "groq"
  | "gemini"
  | "anthropic"
  | "openrouter"
  | "azure"
  | "ollama"
  | "custom";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type JSONSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
};

export type ProviderToolDefinition = {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema;
};

export type ChatCompletionResult = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  toolCalls?: ToolCall[];
};

export type ChatCompletionParams = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
};

export interface AIProvider {
  readonly id: AIProviderId;

  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;

  createEmbedding(text: string, model?: string): Promise<number[]>;

  transcribeAudio(
    audioBuffer: Buffer,
    filename: string,
    model?: string
  ): Promise<string>;

  analyzeImage(
    imageUrl: string,
    model?: string,
    prompt?: string
  ): Promise<string>;
}
