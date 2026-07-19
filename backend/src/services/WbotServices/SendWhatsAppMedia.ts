import {
  WAMessage,
  AnyMediaMessageContent,
  AnyMessageContent
} from "libzapitu-rf";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import mime from "mime-types";
import iconv from "iconv-lite";
import { Readable } from "stream";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Ticket from "../../models/Ticket";
import { verifyMediaMessage, verifyMessage } from "./wbotMessageListener";
import CheckSettings from "../../helpers/CheckSettings";
import saveMediaToFile from "../../helpers/saveMediaFile";
import { getJidOf } from "./getJidOf";
import { logger } from "../../utils/logger";
import { URLCharEncoder } from "../../helpers/URLCharEncoder";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  caption?: string;
  ptt?: boolean;
}

export type MediaInfo = {
  mediaUrl: string;
  mimetype: string;
  filename: string;
};

const execAsync = promisify(exec);

const publicFolder = __dirname.endsWith("/dist")
  ? path.resolve(__dirname, "..", "public")
  : path.resolve(__dirname, "..", "..", "..", "public");

const supportedImages = ["image/png", "image/jpg", "image/jpeg", "image/webp"];

const MIN_AUDIO_BYTES = 256;
const MIN_AUDIO_DURATION_SEC = 0.3;

const isPanelRecordedAudio = (fileName: string, mimetype?: string): boolean => {
  const normalized = (fileName || "").toLowerCase();
  const mime = (mimetype || "").toLowerCase();
  return (
    normalized.includes("audio-record-site") ||
    (mime.includes("audio/mpeg") && normalized.endsWith(".mp3"))
  );
};

const probeAudioDuration = async (filePath: string): Promise<number> => {
  const { stderr, stdout } = await execAsync(
    `"${ffmpegPath.path}" -hide_banner -i "${filePath}" 2>&1 || true`
  );
  const output = `${stderr || ""}\n${stdout || ""}`;
  const match = output.match(/Duration:\s(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);

  if (!match) {
    throw new AppError("ERR_INVALID_AUDIO_FILE", 400);
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

const validateOutboundAudio = async (
  filePath: string,
  fileName: string
): Promise<void> => {
  const stats = fs.statSync(filePath);
  if (!stats.size || stats.size < MIN_AUDIO_BYTES) {
    throw new AppError("ERR_EMPTY_AUDIO_FILE", 400);
  }

  const duration = await probeAudioDuration(filePath);
  if (!Number.isFinite(duration) || duration < MIN_AUDIO_DURATION_SEC) {
    throw new AppError("ERR_AUDIO_TOO_SHORT", 400);
  }

  logger.info(
    {
      fileName,
      sizeBytes: stats.size,
      durationSec: duration
    },
    "Outbound audio validated"
  );
};

const processRecordedAudio = async (
  audio: string
): Promise<{
  stream: Readable;
  outputPath: string;
}> => {
  const outputAudio = path.join(
    publicFolder,
    `ticketz-audio-${Date.now()}.ogg`
  );

  await execAsync(
    `"${ffmpegPath.path}" -y -i "${audio}" -vn -ar 16000 -ac 1 -c:a libopus -b:a 24k "${outputAudio}"`
  );

  await validateOutboundAudio(outputAudio, path.basename(outputAudio));

  return {
    stream: fs.createReadStream(outputAudio),
    outputPath: outputAudio
  };
};

export const getMessageFileOptions = async (
  fileName: string,
  pathMedia: string,
  mimetype?: string,
  ptt?: boolean
): Promise<AnyMediaMessageContent> => {
  mimetype = mimetype || mime.lookup(pathMedia) || "application/octet-stream";

  const url = pathMedia.match(/^https?:\/\//) && {
    url: pathMedia
  };

  let tempConvertedPath: string | null = null;

  try {
    let options: AnyMediaMessageContent;

    if (mimetype.startsWith("video/")) {
      options = {
        fileName,
        video: url || { stream: fs.createReadStream(pathMedia) }
      };
    } else if (mimetype.startsWith("audio/")) {
      const needConvert = !url && isPanelRecordedAudio(fileName, mimetype);

      if (needConvert) {
        await validateOutboundAudio(pathMedia, fileName);
        const converted = await processRecordedAudio(pathMedia);
        tempConvertedPath = converted.outputPath;
        options = {
          fileName: fileName.replace(/\.[^.]+$/, ".ogg"),
          audio: { stream: converted.stream },
          mimetype: "audio/ogg; codecs=opus",
          ptt: true
        };
      } else if (mimetype === "audio/ogg") {
        options = {
          fileName,
          audio: url || { stream: fs.createReadStream(pathMedia) },
          mimetype: "audio/ogg; codecs=opus",
          ptt: ptt ?? true
        };
      } else {
        options = {
          fileName,
          audio: url || { stream: fs.createReadStream(pathMedia) },
          mimetype,
          ptt: !!ptt
        };
      }
    } else if (supportedImages.includes(mimetype)) {
      options = {
        fileName,
        image: url || { stream: fs.createReadStream(pathMedia) }
      };
    } else {
      options = {
        fileName,
        document: url || { stream: fs.createReadStream(pathMedia) },
        mimetype
      };
    }

    return options;
  } catch (error) {
    if (tempConvertedPath && fs.existsSync(tempConvertedPath)) {
      fs.unlinkSync(tempConvertedPath);
    }
    throw error;
  }
};

export const sendWhatsappFile = async (
  ticket: Ticket,
  mediaInfo: MediaInfo,
  options: AnyMediaMessageContent
): Promise<WAMessage> => {
  try {
    const wbot = await GetTicketWbot(ticket);

    const sentMessage = await wbot.sendMessage(getJidOf(ticket), options);

    await verifyMediaMessage(sentMessage, ticket, ticket.contact, {
      mediaInfo
    });

    return sentMessage;
  } catch (error) {
    logger.error({ message: error.message }, "Error sending WhatsApp message");
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export const SendWhatsAppMessage = async (
  ticket: Ticket,
  options: AnyMessageContent
): Promise<WAMessage> => {
  try {
    const wbot = await GetTicketWbot(ticket);

    const sentMessage = await wbot.sendMessage(getJidOf(ticket), options);

    wbot.cacheMessage(sentMessage);

    await verifyMessage(sentMessage, ticket, ticket.contact);

    return sentMessage;
  } catch (error) {
    logger.error({ message: error.message }, "Error sending WhatsApp message");
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export const SendWhatsAppMedia = async ({
  media,
  ticket,
  caption,
  ptt
}: Request): Promise<WAMessage> => {
  try {
    const pathMedia = media.path;

    let fileName = "";
    try {
      fileName = iconv.decode(
        Buffer.from(media.originalname, "binary"),
        "utf8"
      );
    } catch (error) {
      logger.error(
        { message: error.message },
        "Error converting filename to UTF-8:"
      );
      fileName = media.originalname;
    }

    if (
      media.mimetype?.startsWith("audio/") &&
      isPanelRecordedAudio(fileName, media.mimetype)
    ) {
      await validateOutboundAudio(pathMedia, fileName);
    }

    const fileLimit = parseInt(await CheckSettings("uploadLimit", "15"), 10);

    const readableFile = fs.createReadStream(pathMedia);
    const savedPath = await saveMediaToFile(
      {
        data: readableFile,
        mimetype: media.mimetype,
        filename: fileName || media.originalname
      },
      { destination: ticket }
    );
    readableFile.destroy();

    const mediaInfo = {
      mediaUrl: savedPath,
      mimetype: media.mimetype,
      filename: fileName || media.originalname
    };

    if (media.size > fileLimit * 1024 * 1024) {
      const fileUrl = savedPath.startsWith("http")
        ? savedPath
        : `${process.env.BACKEND_URL}/public/${savedPath}`;
      return SendWhatsAppMessage(ticket, {
        text: `📎 *${fileName}*\n\n🔗 ${URLCharEncoder(fileUrl)}`
      });
    }

    const options = await getMessageFileOptions(
      fileName,
      pathMedia,
      media.mimetype,
      ptt ?? isPanelRecordedAudio(fileName, media.mimetype)
    );

    if (!options) {
      throw new AppError("ERR_INVALID_AUDIO_FILE", 400);
    }

    return sendWhatsappFile(ticket, mediaInfo, {
      caption: caption || undefined,
      fileName,
      ...options
    } as AnyMediaMessageContent);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error({ message: error.message }, "Error sending WhatsApp media");
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
