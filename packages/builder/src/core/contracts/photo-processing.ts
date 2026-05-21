import type { _Object } from "@aws-sdk/client-s3";

import type { PhotoManifestItem } from "../../types/photo.js";

export interface PhotoProcessorOptions {
  isForceMode: boolean;
  isForceManifest: boolean;
  isForceThumbnails: boolean;
}

export interface PhotoProcessingContext {
  photoKey: string;
  obj: _Object;
  existingItem: PhotoManifestItem | undefined;
  livePhotoMap: Map<string, _Object>;
  options: PhotoProcessorOptions;
  pluginData: Record<string, unknown>;
}
