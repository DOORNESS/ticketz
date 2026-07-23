import { ResolvedStorageConfig } from "./StorageConfigService";
import { S3CompatibleStorageAdapter } from "./S3CompatibleStorageAdapter";
import { IStorageAdapter } from "./types";

export class BackblazeB2Adapter implements IStorageAdapter {
  private adapter: S3CompatibleStorageAdapter;

  constructor(config: ResolvedStorageConfig) {
    this.adapter = new S3CompatibleStorageAdapter({
      ...config,
      provider: "backblaze"
    });
  }

  upload(input: Parameters<IStorageAdapter["upload"]>[0]) {
    return this.adapter.upload(input);
  }

  download(key: string) {
    return this.adapter.download(key);
  }

  delete(key: string) {
    return this.adapter.delete(key);
  }

  deleteMany(keys: string[]) {
    return this.adapter.deleteMany(keys);
  }

  exists(key: string) {
    return this.adapter.exists(key);
  }

  headObject(key: string) {
    return this.adapter.headObject(key);
  }

  getPublicUrl(key: string) {
    return this.adapter.getPublicUrl(key);
  }

  getSignedUrl(key: string, expiresInSeconds?: number) {
    return this.adapter.getSignedUrl(key, expiresInSeconds);
  }
}
