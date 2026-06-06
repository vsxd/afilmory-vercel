import type { Logger } from "../../logger/index.js";
import type { StorageManager } from "../../storage/index.js";
import type { StorageConfig } from "../../storage/interfaces.js";
import type { BuilderConfig } from "../../types/config.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import type {
  BuilderServices,
  OutputPathsService,
  PhotoIdService,
  StorageService,
} from "../contracts/services.js";

/**
 * Backing object that AfilmoryBuilder (and Worker bootstrap) supplies to
 * createBuilderServices. Using a record of getters keeps this layer
 * decoupled from the AfilmoryBuilder class — anything matching the shape
 * works (real builder, mocks, alternative implementations).
 */
export interface BuilderServicesBacking {
  config: BuilderConfig;
  logger: Logger;
  getStorageConfig: () => StorageConfig;
  getStorageManager: () => StorageManager;
  createStorageManager: (config: StorageConfig) => StorageManager;
  hasPhotoIdCollision: (key: string) => boolean;
  getPhotoIdForKey: (key: string, existingItem?: PhotoManifestItem) => string;
  setPhotoIdCollisionKeys: (keys: Iterable<string>) => void;
  getOutputSettings: () => BuilderConfig["output"];
}

export function createBuilderServices(
  backing: BuilderServicesBacking,
): BuilderServices {
  const storage: StorageService = {
    createManager: (config) => backing.createStorageManager(config),
    getConfig: () => backing.getStorageConfig(),
    getManager: () => backing.getStorageManager(),
  };

  const output: OutputPathsService = {
    getSettings: () => backing.getOutputSettings(),
  };

  const photoId: PhotoIdService = {
    hasCollision: (key) => backing.hasPhotoIdCollision(key),
    getIdForKey: (key, existingItem) =>
      backing.getPhotoIdForKey(key, existingItem),
    setCollisionKeys: (keys) => backing.setPhotoIdCollisionKeys(keys),
  };

  return {
    storage,
    output,
    photoId,
    config: backing.config,
    logger: backing.logger,
  };
}
