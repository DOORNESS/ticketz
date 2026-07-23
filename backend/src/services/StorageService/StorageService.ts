import crypto from "crypto";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import { FileContents, FileStorage } from "@flystorage/file-storage";
import { LocalStorageAdapter } from "@flystorage/local-fs";
import { getPublicPath } from "../../helpers/GetPublicPath";
import { makeRandomId } from "../../helpers/MakeRandomId";
import { BackblazeB2Adapter } from "./BackblazeB2Adapter";
import { S3CompatibleStorageAdapter } from "./S3CompatibleStorageAdapter";
import { loadStorageConfig } from "./StorageConfigService";
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

  private rootPrefix = "suporte";

  private initializedForCompanyId: number | null = null;

  private initPromise: Promise<void> | null = null;

  private createLocalAdapter(): IStorageAdapter {
    return {
      upload: async (input: UploadInput): Promise<UploadResult> => {
        const root = getPublicPath();
        const targetPath = path.join(root, input.key);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        const storage = new FileStorage(new LocalStorageAdapter(root));
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
  }

  private async initialize(companyId: number): Promise<void> {
    const config = await loadStorageConfig(companyId);

    if (!config) {
      this.provider = "local";
      this.adapter = this.createLocalAdapter();
      this.rootPrefix = (process.env.STORAGE_ROOT_PREFIX || "suporte").replace(
        /^\/+|\/+$/g,
        ""
      );
      this.initializedForCompanyId = companyId;
      return;
    }

    this.rootPrefix = config.rootPrefix;

    if (config.provider === "backblaze") {
      this.provider = "backblaze";
      this.adapter = new BackblazeB2Adapter(config);
    } else {
      this.provider = config.provider;
      this.adapter = new S3CompatibleStorageAdapter(config);
    }

    this.initializedForCompanyId = companyId;
  }

  async ensureReady(companyId: number): Promise<void> {
    if (this.adapter && this.initializedForCompanyId === companyId) {
      return;
    }

    if (!this.initPromise || this.initializedForCompanyId !== companyId) {
      this.initPromise = this.initialize(companyId);
    }

    await this.initPromise;
  }

  resetCache(): void {
    this.adapter = null;
    this.provider = "local";
    this.initializedForCompanyId = null;
    this.initPromise = null;
  }

  private async getAdapter(companyId: number): Promise<IStorageAdapter> {
    await this.ensureReady(companyId);
    return this.adapter as IStorageAdapter;
  }

  getProvider(): StorageProvider {
    return this.provider;
  }

  getRootPrefix(): string {
    return this.rootPrefix;
  }

  buildObjectKey(options: StoreFileOptions): string {
    const ext = options.filename.includes(".")
      ? options.filename.split(".").pop()
      : mime.extension(options.contentType || "") || "bin";
    const folder = options.folder || "media";
    const randomId = makeRandomId(12);
    const ticketPart = options.ticketId ? `${options.ticketId}/` : "";
    return `${this.rootPrefix}/${options.companyId}/${folder}/${ticketPart}${randomId}.${ext}`;
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
    const adapter = await this.getAdapter(options.companyId);
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

  async download(key: string, companyId = 1): Promise<Buffer> {
    const adapter = await this.getAdapter(companyId);
    return adapter.download(key);
  }

  async delete(key: string, companyId = 1): Promise<void> {
    const adapter = await this.getAdapter(companyId);
    return adapter.delete(key);
  }

  getPublicUrl(key: string): string {
    if (!this.adapter) {
      return `/public/${key}`;
    }

    return this.adapter.getPublicUrl(key);
  }
}

export default new StorageService();
