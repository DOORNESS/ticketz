import crypto from "crypto";
import mime from "mime-types";
import { FileContents, FileStorage } from "@flystorage/file-storage";
import { LocalStorageAdapter } from "@flystorage/local-fs";
import { getPublicPath } from "../../helpers/GetPublicPath";
import { makeRandomId } from "../../helpers/MakeRandomId";
import { BackblazeB2Adapter } from "./BackblazeB2Adapter";
import {
  IStorageAdapter,
  StorageProvider,
  UploadInput,
  UploadResult
} from "./types";

export type StoreFileOptions = {
  companyId: number;
  ticketId?: number;
  messageId?: string;
  filename: string;
  contentType?: string;
  folder?: string;
  uploadedByUserId?: number;
};

class StorageService {
  private adapter: IStorageAdapter | null = null;

  private provider: StorageProvider = "local";

  private isB2Configured(): boolean {
    return !!(
      process.env.B2_APPLICATION_KEY_ID &&
      process.env.B2_APPLICATION_KEY &&
      process.env.B2_BUCKET &&
      process.env.B2_ENDPOINT
    );
  }

  private getAdapter(): IStorageAdapter {
    if (this.adapter) {
      return this.adapter;
    }

    if (this.isB2Configured()) {
      this.provider = "backblaze";
      this.adapter = new BackblazeB2Adapter();
      return this.adapter;
    }

    this.provider = "local";
    this.adapter = {
      upload: async (input: UploadInput): Promise<UploadResult> => {
        const storage = new FileStorage(
          new LocalStorageAdapter(getPublicPath())
        );
        const body = Buffer.isBuffer(input.body)
          ? input.body
          : Buffer.from(input.body as Uint8Array);
        await storage.write(input.key, body as FileContents);
        return {
          provider: "local",
          bucket: "local",
          key: input.key,
          publicUrl: `/public/${input.key}`,
          sizeBytes: body.length
        };
      },
      download: async (key: string): Promise<Buffer> => {
        const storage = new FileStorage(
          new LocalStorageAdapter(getPublicPath())
        );
        const data = await storage.readToString(key);
        return Buffer.from(data);
      },
      delete: async (key: string): Promise<void> => {
        const storage = new FileStorage(
          new LocalStorageAdapter(getPublicPath())
        );
        await storage.deleteFile(key);
      },
      getPublicUrl: (key: string): string => `/public/${key}`
    };

    return this.adapter;
  }

  getProvider(): StorageProvider {
    this.getAdapter();
    return this.provider;
  }

  buildObjectKey(options: StoreFileOptions): string {
    const ext = options.filename.includes(".")
      ? options.filename.split(".").pop()
      : mime.extension(options.contentType || "") || "bin";
    const folder = options.folder || "media";
    const randomId = makeRandomId(12);
    const ticketPart = options.ticketId ? `${options.ticketId}/` : "";
    return `${folder}/${options.companyId}/${ticketPart}${randomId}.${ext}`;
  }

  hashBuffer(buffer: Buffer): string {
    return crypto
      .createHash("sha256")
      .update(buffer as crypto.BinaryLike)
      .digest("hex");
  }

  async uploadBuffer(
    buffer: Buffer,
    options: StoreFileOptions
  ): Promise<UploadResult & { hash: string }> {
    const adapter = this.getAdapter();
    const key = this.buildObjectKey(options);

    const result = await adapter.upload({
      key,
      body: buffer,
      contentType:
        options.contentType ||
        mime.lookup(options.filename) ||
        "application/octet-stream",
      companyId: options.companyId
    });

    return {
      ...result,
      hash: this.hashBuffer(buffer)
    };
  }

  async download(key: string): Promise<Buffer> {
    return this.getAdapter().download(key);
  }

  async delete(key: string): Promise<void> {
    return this.getAdapter().delete(key);
  }

  getPublicUrl(key: string): string {
    return this.getAdapter().getPublicUrl(key);
  }
}

export default new StorageService();
