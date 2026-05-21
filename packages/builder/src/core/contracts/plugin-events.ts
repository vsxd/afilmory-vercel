import type { StorageObject } from "../../storage/interfaces.js";
import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
} from "../../types/manifest.js";
import type { BuilderOptions, BuilderResult } from "../../types/options.js";
import type {
  PhotoManifestItem,
  ProcessPhotoResult,
} from "../../types/photo.js";
import type {
  PhotoProcessingContext,
  PhotoProcessorOptions,
} from "./photo-processing.js";

export interface BuilderPluginEventPayloads {
  beforeBuild: {
    options: BuilderOptions;
  };
  beforePhotoProcess: {
    options: BuilderOptions;
    context: PhotoProcessingContext;
  };
  afterPhotoProcess: {
    options: BuilderOptions;
    context: PhotoProcessingContext;
    result: {
      type: ProcessPhotoResult["type"];
      item: PhotoManifestItem | null;
      pluginData: Record<string, unknown>;
    };
  };
  photoProcessError: {
    options: BuilderOptions;
    context: PhotoProcessingContext;
    error: unknown;
  };
  afterManifestLoad: {
    options: BuilderOptions;
    manifest: AfilmoryManifest;
    manifestMap: Map<string, PhotoManifestItem>;
  };
  afterAllFilesListed: {
    options: BuilderOptions;
    allObjects: StorageObject[];
  };
  afterLivePhotoDetection: {
    options: BuilderOptions;
    livePhotoMap: Map<string, StorageObject>;
  };
  afterImagesListed: {
    options: BuilderOptions;
    imageObjects: StorageObject[];
  };
  afterTasksPrepared: {
    options: BuilderOptions;
    tasks: StorageObject[];
    totalImages: number;
  };
  beforeProcessTasks: {
    options: BuilderOptions;
    tasks: StorageObject[];
    processorOptions: PhotoProcessorOptions;
    mode: "cluster" | "worker";
    concurrency: number;
  };
  afterProcessTasks: {
    options: BuilderOptions;
    tasks: StorageObject[];
    results: ProcessPhotoResult[];
    manifest: PhotoManifestItem[];
    stats: {
      newCount: number;
      processedCount: number;
      skippedCount: number;
    };
  };
  afterCleanup: {
    options: BuilderOptions;
    manifest: PhotoManifestItem[];
    deletedCount: number;
  };
  beforeAddManifestItem: {
    options: BuilderOptions;
    item: PhotoManifestItem;
    pluginData: Record<string, unknown>;
    resultType: ProcessPhotoResult["type"];
  };
  beforeSaveManifest: {
    options: BuilderOptions;
    manifest: PhotoManifestItem[];
    cameras: CameraInfo[];
    lenses: LensInfo[];
  };
  afterSaveManifest: {
    options: BuilderOptions;
    manifest: PhotoManifestItem[];
    cameras: CameraInfo[];
    lenses: LensInfo[];
  };
  afterBuild: {
    options: BuilderOptions;
    result: BuilderResult;
    manifest: PhotoManifestItem[];
  };
  onError: {
    options: BuilderOptions;
    error: unknown;
  };
}

export type BuilderPluginEvent = keyof BuilderPluginEventPayloads;
