import type {
  StorageListing,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from "../../storage/interfaces.js";

/** Capabilities exposed to processing/plugins, independent of the concrete manager. */
export interface BuilderStorage {
  getFile: (key: string, signal?: AbortSignal) => Promise<Buffer | null>;
  listImages: () => Promise<StorageObject[]>;
  listAllFiles: () => Promise<StorageObject[]>;
  listAllFilesDetailed: () => Promise<StorageListing>;
  generatePublicUrl: (key: string) => Promise<string>;
  detectLivePhotos: (
    objects?: StorageObject[],
  ) => Promise<Map<string, StorageObject>>;
  deleteFile: (key: string) => Promise<void>;
  listObjectKeys: (prefix: string) => Promise<string[]>;
  uploadFile: (
    key: string,
    data: Buffer,
    options?: StorageUploadOptions,
  ) => Promise<StorageObject>;
  addExcludeFilter: (filter: (key: string) => boolean) => void;
  addExcludePrefix: (prefix: string) => void;
  getProvider: () => StorageProvider;
  dispose: () => Promise<void>;
}
