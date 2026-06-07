export type { BuilderOptions, BuilderResult } from "./builder/index.js";
export { AfilmoryBuilder } from "./builder/index.js";
export { createDefaultBuilderConfig } from "./config/defaults.js";
export { defineBuilderConfig } from "./config/helper.js";
export type { LoadBuilderConfigOptions } from "./config/index.js";
export { resolveBuilderConfig } from "./config/index.js";
export type { GeocodingPluginOptions } from "./plugins/geocoding.js";
export { default as geocodingPlugin } from "./plugins/geocoding.js";
export type { ThumbnailStoragePluginOptions } from "./plugins/thumbnail-storage/index.js";
export {
  THUMBNAIL_PLUGIN_SYMBOL,
  default as thumbnailStoragePlugin,
} from "./plugins/thumbnail-storage/index.js";
export type {
  BuilderPlugin,
  BuilderPluginConfigEntry,
  BuilderPluginEvent,
  BuilderPluginEventPayloads,
  BuilderPluginHookContext,
  BuilderPluginHooks,
  BuilderPluginReference,
} from "./plugins/types.js";
export type { PhotoSourceAdapter } from "./source/adapter.js";
export type {
  ProgressCallback,
  ScanProgress,
  StorageConfig,
  StorageObject,
} from "./storage/index.js";
export type { BuilderConfig, BuilderConfigInput } from "./types/config.js";
export type {
  BuildProgressListener,
  BuildProgressSnapshot,
  BuildProgressStartPayload,
} from "./types/options.js";
