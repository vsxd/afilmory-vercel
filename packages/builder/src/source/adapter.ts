import type { StorageObject, StorageUploadOptions } from "../storage/index.js";

export interface PhotoSourceAdapter {
  readonly provider: "s3";
  getFile: (key: string) => Promise<Buffer | null>;
  listImages: () => Promise<StorageObject[]>;
  listAllFiles: () => Promise<StorageObject[]>;
  generatePublicUrl: (key: string) => string | Promise<string>;
  detectLivePhotos: (allObjects: StorageObject[]) => Map<string, StorageObject>;
  deleteFile: (key: string) => Promise<void>;
  uploadFile: (
    key: string,
    data: Buffer,
    options?: StorageUploadOptions,
  ) => Promise<StorageObject>;
}
