import type { StorageObject } from "../../storage/interfaces.js";
import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
} from "../../types/manifest.js";
import type {
  BuilderPluginOptions,
  BuilderResult,
} from "../../types/options.js";
import type {
  PhotoManifestItem,
  PhotoProcessingFailure,
  ProcessPhotoResult,
} from "../../types/photo.js";
import type {
  PhotoProcessingContext,
  PhotoProcessorOptions,
} from "./photo-processing.js";

export interface BuilderPluginEventPayloads {
  beforeBuild: {
    options: BuilderPluginOptions;
  };
  beforePhotoProcess: {
    options: BuilderPluginOptions;
    context: PhotoProcessingContext;
  };
  afterPhotoProcess: {
    options: BuilderPluginOptions;
    context: PhotoProcessingContext;
    result: {
      type: ProcessPhotoResult["type"];
      item: PhotoManifestItem | null;
      pluginData: Record<string, unknown>;
    };
  };
  photoProcessError: {
    options: BuilderPluginOptions;
    context: PhotoProcessingContext;
    error: unknown;
    failure: PhotoProcessingFailure;
  };
  afterManifestLoad: {
    options: BuilderPluginOptions;
    manifest: AfilmoryManifest;
    manifestMap: Map<string, PhotoManifestItem>;
  };
  afterAllFilesListed: {
    options: BuilderPluginOptions;
    allObjects: StorageObject[];
  };
  afterLivePhotoDetection: {
    options: BuilderPluginOptions;
    livePhotoMap: Map<string, StorageObject>;
  };
  afterImagesListed: {
    options: BuilderPluginOptions;
    imageObjects: StorageObject[];
  };
  afterTasksPrepared: {
    options: BuilderPluginOptions;
    tasks: StorageObject[];
    totalImages: number;
  };
  beforeProcessTasks: {
    options: BuilderPluginOptions;
    tasks: StorageObject[];
    processorOptions: PhotoProcessorOptions;
    mode: "cluster" | "worker";
    concurrency: number;
  };
  afterProcessTasks: {
    options: BuilderPluginOptions;
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
    options: BuilderPluginOptions;
    manifest: PhotoManifestItem[];
    deletedCount: number;
  };
  beforeAddManifestItem: {
    options: BuilderPluginOptions;
    item: PhotoManifestItem;
    pluginData: Record<string, unknown>;
    resultType: ProcessPhotoResult["type"];
  };
  beforeSaveManifest: {
    options: BuilderPluginOptions;
    manifest: PhotoManifestItem[];
    cameras: CameraInfo[];
    lenses: LensInfo[];
  };
  afterSaveManifest: {
    options: BuilderPluginOptions;
    manifest: readonly PhotoManifestItem[];
    cameras: readonly CameraInfo[];
    lenses: readonly LensInfo[];
  };
  afterBuild: {
    options: BuilderPluginOptions;
    result: BuilderResult;
    manifest: PhotoManifestItem[];
  };
  onError: {
    options: BuilderPluginOptions;
    error: unknown;
  };
}

export type BuilderPluginEvent = keyof BuilderPluginEventPayloads;
