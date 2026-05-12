import type { PhotoProcessingLoggers } from '../../photo/logger-types.js'
import type { StorageManager } from '../../storage/index.js'
import type { StorageConfig } from '../../storage/interfaces.js'
import type { BuilderPluginEvent, BuilderPluginEventPayloads } from './plugin-events.js'
import type { PluginRunState } from './plugin-ref.js'
import type { BuilderServices } from './services.js'

/**
 * Function shape for emitting plugin events from within the photo pipeline.
 * Decoupled from AfilmoryBuilder so the execution context does not need
 * a hard dependency on the builder class.
 */
export type EmitPluginEventFn = <TEvent extends BuilderPluginEvent>(
  runState: PluginRunState,
  event: TEvent,
  payload: BuilderPluginEventPayloads[TEvent],
) => Promise<void>

/**
 * The async-local-storage context that photo pipeline stages can access
 * via getPhotoExecutionContext(). The `services` field replaces the
 * previous `builder: AfilmoryBuilder` reference, breaking the cycle.
 */
export interface PhotoExecutionContext {
  services: BuilderServices
  emitPluginEvent: EmitPluginEventFn
  storageManager: StorageManager
  storageConfig: StorageConfig
  normalizeStorageKey: (key: string) => string
  loggers?: PhotoProcessingLoggers
}
