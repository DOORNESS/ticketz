import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import {
  IStorageAdapter,
  StorageProvider,
  StorageObjectHead,
  UploadInput,
  UploadResult
} from "./types";
import { ResolvedStorageConfig } from "./StorageConfigService";
import { getSignedUrlTtlSeconds, getStorageRegion } from "./storageEnv";
import { withStorageRetry } from "./storageRetry";

// Lazy require so the API can boot even if VPS node_modules is one package behind.
const loadGetSignedUrl = async () => {
  const mod = await import("@aws-sdk/s3-request-presigner");
  return mod.getSignedUrl;
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks as unknown as Uint8Array[]);
};

export class S3CompatibleStorageAdapter implements IStorageAdapter {
  private client: S3Client;

  private bucket: string;

  private provider: StorageProvider;

  private publicUrlBase: string;

  constructor(config: ResolvedStorageConfig) {
    this.bucket = config.bucket;
    this.provider = config.provider;
    this.publicUrlBase = config.publicUrl;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || getStorageRegion(),
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: true
    });
  }

  getPublicUrl(key: string): string {
    if (this.publicUrlBase) {
      return `${this.publicUrlBase}/${key}`;
    }

    return key;
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds = getSignedUrlTtlSeconds()
  ): Promise<string> {
    const getSignedUrl = await loadGetSignedUrl();
    return withStorageRetry("getSignedUrl", () =>
      getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key
        }),
        { expiresIn: expiresInSeconds }
      )
    );
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const body =
      typeof input.body === "string"
        ? Buffer.from(input.body, "utf-8")
        : input.body;

    await withStorageRetry("upload", () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: body,
          ContentType: input.contentType || "application/octet-stream",
          Metadata: input.metadata
        })
      )
    );

    return {
      provider: this.provider,
      bucket: this.bucket,
      key: input.key,
      publicUrl: this.getPublicUrl(input.key),
      sizeBytes: body.length
    };
  }

  async download(key: string): Promise<Buffer> {
    const response = await withStorageRetry("download", () =>
      this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key
        })
      )
    );

    return streamToBuffer(response.Body as Readable);
  }

  async delete(key: string): Promise<void> {
    await withStorageRetry("delete", () =>
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key
        })
      )
    );
  }

  async deleteMany(
    keys: string[]
  ): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      try {
        await withStorageRetry("deleteMany", () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: {
                Objects: chunk.map(Key => ({ Key })),
                Quiet: true
              }
            })
          )
        );
        deleted.push(...chunk);
      } catch {
        failed.push(...chunk);
      }
    }

    return { deleted, failed };
  }

  async exists(key: string): Promise<boolean> {
    const head = await this.headObject(key);
    return head.exists;
  }

  async headObject(key: string): Promise<StorageObjectHead> {
    try {
      const response = await withStorageRetry("headObject", () =>
        this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: key
          })
        )
      );

      return {
        exists: true,
        sizeBytes: response.ContentLength,
        contentType: response.ContentType,
        lastModified: response.LastModified
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        return { exists: false };
      }
      throw error;
    }
  }
}
