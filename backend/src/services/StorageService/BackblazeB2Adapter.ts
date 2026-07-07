import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { IStorageAdapter, UploadInput, UploadResult } from "./types";

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks as unknown as Uint8Array[]);
};

export class BackblazeB2Adapter implements IStorageAdapter {
  private client: S3Client;

  private bucket: string;

  private publicUrlBase: string;

  constructor() {
    const endpoint = process.env.B2_ENDPOINT;
    const keyId = process.env.B2_APPLICATION_KEY_ID;
    const appKey = process.env.B2_APPLICATION_KEY;
    this.bucket = process.env.B2_BUCKET || "";
    this.publicUrlBase = (process.env.B2_PUBLIC_URL || "").replace(/\/$/, "");

    if (!endpoint || !keyId || !appKey || !this.bucket) {
      throw new Error("Backblaze B2 storage is not configured");
    }

    this.client = new S3Client({
      endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: appKey
      },
      forcePathStyle: true
    });
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const body =
      typeof input.body === "string"
        ? Buffer.from(input.body, "utf-8")
        : input.body;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType || "application/octet-stream",
        Metadata: input.metadata
      })
    );

    return {
      provider: "backblaze",
      bucket: this.bucket,
      key: input.key,
      publicUrl: this.getPublicUrl(input.key),
      sizeBytes: body.length
    };
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );

    return streamToBuffer(response.Body as Readable);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );
  }
}
