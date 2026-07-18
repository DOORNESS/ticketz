import AppError from "../../../errors/AppError";
import { AIProvider, AIProviderId } from "./AIProvider";
import { createOpenAICompatibleProvider } from "./OpenAIProvider";

const UNSUPPORTED_PROVIDERS: AIProviderId[] = ["anthropic"];

export const getAIProvider = async (
  companyId: number,
  providerId?: string
): Promise<AIProvider> => {
  const normalized = (providerId || "openai").toLowerCase() as AIProviderId;

  if (UNSUPPORTED_PROVIDERS.includes(normalized)) {
    throw new AppError(`AI provider not implemented yet: ${normalized}`, 501);
  }

  const provider = await createOpenAICompatibleProvider(companyId, normalized);

  if (!provider) {
    throw new AppError("AI API key not configured", 400);
  }

  return provider;
};
