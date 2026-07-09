import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import OpenAI from "openai";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { convertAudioToOggOpus } from "../../helpers/mediaConversion";
import { streamToBuffer } from "../../helpers/mediaStorage";
import { logger } from "../../utils/logger";

const SUPPORTED_EXTENSIONS = new Set([
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "wav",
  "webm",
  "opus"
]);

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1"
};

const DEFAULT_TRANSCRIPTION_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini-transcribe",
  groq: "whisper-large-v3-turbo",
  openrouter: "gpt-4o-mini-transcribe"
};

export type AudioTranscriptionResult = {
  text: string;
  success: boolean;
  attempts: number;
  errorReason?: string;
  bufferSize: number;
  mimeType?: string;
  filename: string;
  model: string;
  provider: string;
};

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const resolveExtension = (filename: string, mimeType?: string): string => {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && SUPPORTED_EXTENSIONS.has(fromName)) {
    return fromName;
  }

  if (mimeType) {
    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    const map: Record<string, string> = {
      "audio/ogg": "ogg",
      "audio/opus": "opus",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/x-m4a": "m4a"
    };
    if (map[normalized]) {
      return map[normalized];
    }
  }

  return "ogg";
};

const writeTempAudioFile = (
  buffer: Buffer,
  extension: string,
  attempt: number
): string => {
  const tempFilePath = path.join(
    tmpdir(),
    `ticketz-audio-${Date.now()}-${attempt}.${extension}`
  );
  fs.writeFileSync(tempFilePath, new Uint8Array(buffer));
  return tempFilePath;
};

const cleanupTempFile = (tempFilePath?: string | null): void => {
  if (!tempFilePath) {
    return;
  }

  try {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  } catch (error) {
    logger.warn(
      { error, tempFilePath },
      "AudioTranscription: failed to cleanup temp file"
    );
  }
};

export const transcribeAudioBuffer = async ({
  companyId,
  audioBuffer,
  filename = "audio.ogg",
  mimeType,
  model,
  providerId,
  maxAttempts = 3,
  ticketId,
  messageId
}: {
  companyId: number;
  audioBuffer: Buffer;
  filename?: string;
  mimeType?: string;
  model?: string;
  providerId?: string;
  maxAttempts?: number;
  ticketId?: number;
  messageId?: string;
}): Promise<AudioTranscriptionResult> => {
  const apiKey = await GetCompanySetting(companyId, "openAiKey", null);
  const provider =
    providerId ||
    (await GetCompanySetting(companyId, "aiProvider", "openai")) ||
    "openai";
  const resolvedModel =
    model || DEFAULT_TRANSCRIPTION_MODELS[provider] || "gpt-4o-mini-transcribe";
  const extension = resolveExtension(filename, mimeType);

  logger.info(
    {
      companyId,
      ticketId,
      messageId,
      bufferSize: audioBuffer.length,
      filename,
      mimeType,
      extension,
      model: resolvedModel,
      provider
    },
    "AudioTranscription: start"
  );

  if (!apiKey) {
    return {
      text: "",
      success: false,
      attempts: 0,
      errorReason: "missing_openai_api_key",
      bufferSize: audioBuffer.length,
      mimeType,
      filename,
      model: resolvedModel,
      provider
    };
  }

  let lastError = "unknown_error";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let tempFilePath: string | null = null;

    try {
      let workingBuffer = audioBuffer;
      let uploadExtension = extension;

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        logger.info(
          { extension, attempt, ticketId, messageId },
          "AudioTranscription: converting unsupported format"
        );
        const converted = await convertAudioToOggOpus(audioBuffer);
        workingBuffer = Buffer.isBuffer(converted.data)
          ? converted.data
          : await streamToBuffer(converted.data);
        uploadExtension = "ogg";
      }

      tempFilePath = writeTempAudioFile(
        workingBuffer,
        uploadExtension,
        attempt
      );

      const baseURL =
        (await GetCompanySetting(companyId, "aiBaseUrl", null)) ||
        PROVIDER_BASE_URLS[provider] ||
        PROVIDER_BASE_URLS.openai;

      const client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: 0,
        timeout: 60000
      });

      const response = await client.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: resolvedModel
      });

      const text = response.text?.trim() || "";

      logger.info(
        {
          attempt,
          ticketId,
          messageId,
          textLength: text.length,
          bufferSize: audioBuffer.length,
          mimeType,
          filename
        },
        "AudioTranscription: attempt finished"
      );

      if (text) {
        return {
          text,
          success: true,
          attempts: attempt,
          bufferSize: audioBuffer.length,
          mimeType,
          filename,
          model: resolvedModel,
          provider
        };
      }

      lastError = "empty_transcription_response";
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : String(error || "unknown_error");

      logger.error(
        {
          attempt,
          ticketId,
          messageId,
          error: lastError,
          bufferSize: audioBuffer.length,
          mimeType,
          filename,
          model: resolvedModel,
          provider
        },
        "AudioTranscription: attempt failed"
      );

      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
      }
    } finally {
      cleanupTempFile(tempFilePath);
    }
  }

  return {
    text: "",
    success: false,
    attempts: maxAttempts,
    errorReason: lastError,
    bufferSize: audioBuffer.length,
    mimeType,
    filename,
    model: resolvedModel,
    provider
  };
};
