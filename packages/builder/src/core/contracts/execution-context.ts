import type { PhotoProcessingLoggers } from '../../photo/logger-types.js'
import type { StorageManager } from '../../storage/index.js'
import type { StorageConfig } from '../../storage/interfaces.js'
import type { BuilderServices } from './services.js'

/**
 * The async-local-storage context that photo pipeline stages can access
 * via getPhotoExecutionContext(). The `services` field replaces the
 * previous `builder: AfilmoryBuilder` reference, breaking the cycle.
 */
export interface PhotoExecutionContext {
  services: BuilderServices
  storageManager: StorageManager
  storageConfig: StorageConfig
  normalizeStorageKey: (key: string) => string
  loggers?: PhotoProcessingLoggers
}
