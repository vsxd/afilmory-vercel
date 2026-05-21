import type { Logger } from '../../logger/index.js'
import type { StorageProviderFactory } from '../../storage/factory.js'
import type { StorageManager } from '../../storage/index.js'
import type { StorageConfig } from '../../storage/interfaces.js'
import type { BuilderConfig, BuilderOutputSettings } from '../../types/config.js'
import type { PhotoManifestItem } from '../../types/photo.js'

export interface StorageService {
  getConfig: () => StorageConfig
  getManager: () => StorageManager
  registerProvider: (name: string, factory: StorageProviderFactory) => void
}

export interface OutputPathsService {
  getSettings: () => BuilderOutputSettings
}

export interface PhotoIdService {
  hasCollision: (key: string) => boolean
  getIdForKey: (key: string, existingItem?: PhotoManifestItem) => string
  setCollisionKeys: (keys: Iterable<string>) => void
}

/**
 * The single entry point for plugins to access builder capabilities.
 * Does NOT include emitPluginEvent or any plugin-specific methods —
 * plugins are event subscribers, not coordinators.
 */
export interface BuilderServices {
  storage: StorageService
  output: OutputPathsService
  photoId: PhotoIdService
  config: BuilderConfig
  logger: Logger
}
