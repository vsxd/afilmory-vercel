import type { EmitPluginEventFn } from '../core/contracts/execution-context.js'
import type { BuilderPluginEvent, BuilderPluginEventPayloads } from '../core/contracts/plugin-events.js'
import type { BuilderServices } from '../core/contracts/services.js'
import type { Logger } from '../logger/index.js'
import type { BuilderConfig } from '../types/config.js'
import type { BuilderOptions } from '../types/options.js'

export type { BuilderPluginEvent, BuilderPluginEventPayloads } from '../core/contracts/plugin-events.js'
export type {
  BuilderPluginConfigEntry,
  BuilderPluginESMImporter,
  BuilderPluginReference,
} from '../core/contracts/plugin-ref.js'
export { isPluginESMImporter } from '../core/contracts/plugin-ref.js'

export interface BuilderPluginInitContext {
  services: BuilderServices
  config: BuilderConfig
  logger: Logger
  pluginOptions: unknown
}

export interface BuilderPluginHookContext<TEvent extends BuilderPluginEvent> {
  services: BuilderServices
  /**
   * Emit a plugin event from within a hook. Useful for plugins that need
   * to construct a photo execution context manually (e.g. for batch
   * reprocessing flows that run outside the main pipeline).
   */
  emitPluginEvent: EmitPluginEventFn
  config: BuilderConfig
  logger: Logger
  options: BuilderOptions
  pluginName: string
  pluginOptions: unknown
  /**
   * A mutable map scoped to the current build run, allowing plugins
   * to persist information between lifecycle hooks.
   */
  runShared: Map<string, unknown>
  event: TEvent
  payload: BuilderPluginEventPayloads[TEvent]
}

export type BuilderPluginHook<TEvent extends BuilderPluginEvent> = (
  context: BuilderPluginHookContext<TEvent>,
) => void | Promise<void>

export type BuilderPluginLifecycleHooks = Partial<{
  [Event in BuilderPluginEvent]: BuilderPluginHook<Event>
}>

export interface BuilderPluginHooks extends BuilderPluginLifecycleHooks {
  onInit?: (context: BuilderPluginInitContext) => void | Promise<void>
}

export interface BuilderPlugin {
  name?: string
  hooks?: BuilderPluginHooks
}

export type BuilderPluginFactory =
  | BuilderPlugin
  | (() => BuilderPlugin | Promise<BuilderPlugin>)
  | ((options: unknown) => BuilderPlugin | Promise<BuilderPlugin>)
