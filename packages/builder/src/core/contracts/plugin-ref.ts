/**
 * Per-build mutable state shared across hooks of the same plugin.
 * Defined here (not in plugins/manager.ts) so contracts that reference
 * the plugin runtime do not need to import the manager.
 */
export type PluginRunState = Map<string, Map<string, unknown>>

/**
 * Minimal plugin reference types used by `BuilderConfig.plugins`. The full
 * hook context structure is intentionally NOT modeled here — config typing
 * does not need it. Plugin authors rely on the richer `BuilderPlugin` type
 * exported from `plugins/types.ts` (or `core/contracts/plugin.ts` after the
 * later refactor) and `satisfies BuilderPlugin` at the definition site.
 */

export interface MinimalBuilderPlugin {
  name?: string
  hooks?: unknown
}

export type BuilderPluginESMImporter = () => Promise<{
  default: (() => MinimalBuilderPlugin | Promise<MinimalBuilderPlugin>) | MinimalBuilderPlugin
}>

export type BuilderPluginReference = string | BuilderPluginESMImporter

export type BuilderPluginConfigEntry = BuilderPluginReference | MinimalBuilderPlugin

export function isPluginESMImporter(value: BuilderPluginConfigEntry): value is BuilderPluginESMImporter {
  return typeof value === 'function' && value.length === 0
}
