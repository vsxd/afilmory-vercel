import type { ExifReaderService } from "../../image/exif.js";
import type { Logger } from "../../logger/index.js";
import type { StorageConfig } from "../../storage/interfaces.js";
import type { BuilderConfig } from "../../types/config.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import type { BuilderStorage } from "./storage.js";

export interface StorageService {
  createManager: (config: StorageConfig) => BuilderStorage;
  getConfig: () => StorageConfig;
  getManager: () => BuilderStorage;
}

/**
 * Read-only photo-ID lookup. Collision-set mutation is deliberately NOT part
 * of this contract: it happens exactly once per run on the builder/session
 * side (DiffPlanner in the primary, worker bootstrap in cluster workers)
 * before any photo is processed — exposing a mutator here would let a plugin
 * silently change photo IDs mid-build.
 */
export interface PhotoIdService {
  getIdForKey: (key: string, existingItem?: PhotoManifestItem) => string;
}

/**
 * The single entry point for plugins to access builder capabilities.
 * Does NOT include emitPluginEvent or any plugin-specific methods —
 * plugins are event subscribers, not coordinators.
 */
export interface BuilderServices {
  exif: ExifReaderService;
  storage: StorageService;
  photoId: PhotoIdService;
  config: BuilderConfig;
  logger: Logger;
}
