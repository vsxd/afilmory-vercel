import type { StorageObject } from "../../storage/interfaces.js";
import type { PhotoManifestItem } from "../../types/photo.js";

export interface PhotoProcessorOptions {
  isForceMode: boolean;
  isForceManifest: boolean;
  isForceThumbnails: boolean;
}

export interface PhotoProcessingContext {
  photoKey: string;
  obj: StorageObject;
  existingItem: PhotoManifestItem | undefined;
  livePhotoMap: Map<string, StorageObject>;
  options: PhotoProcessorOptions;
  pluginData: Record<string, unknown>;
}
