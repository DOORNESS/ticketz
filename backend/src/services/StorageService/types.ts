export type StorageProvider = "backblaze" | "s3" | "r2" | "minio" | "local";

export type UploadInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  companyId: number;
  metadata?: Record<string, string>;
};

export type UploadResult = {
  provider: StorageProvider;
  bucket: string;
  key: string;
  publicUrl: string;
  sizeBytes: number;
};

export type StorageFileInfo = {
  provider: StorageProvider;
  bucket: string;
  key: string;
  publicUrl: string;
};

export interface IStorageAdapter {
  upload(input: UploadInput): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  getSignedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}
