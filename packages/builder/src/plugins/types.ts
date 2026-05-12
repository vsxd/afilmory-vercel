import type { AfilmoryBuilder } from '../builder/builder.js'
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
  /** @deprecated Use `services` instead. Will be removed in Step 9. */
  builder: AfilmoryBuilder
  services: BuilderServices
  config: BuilderConfig
  logger: Logger
  /** @deprecated Use `services.storage.registerProvider` instead. */
  registerStorageProvider: AfilmoryBuilder['registerStorageProvider']
  /**
   * Options provided in the configuration for this plugin.
   */
  pluginOptions: unknown
}

export interface BuilderPluginHookContext<TEvent extends BuilderPluginEvent> {
  /** @deprecated Use `services` instead. Will be removed in Step 9. */
  builder: AfilmoryBuilder
  services: BuilderServices
  config: BuilderConfig
  logger: Logger
  options: BuilderOptions
  /** @deprecated Use `services.storage.registerProvider` instead. */
  registerStorageProvider: AfilmoryBuilder['registerStorageProvider']
  /**
   * Name of the plugin handling the current hook.
   */
  pluginName: string
  /**
   * Options associated with the plugin, if any.
   */
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
