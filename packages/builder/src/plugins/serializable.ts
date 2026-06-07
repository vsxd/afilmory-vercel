import type { BuilderConfig } from "../types/config.js";
import type { BuilderPluginConfigEntry } from "./types.js";
import {
  isBuiltinBuilderPluginDescriptor,
  isPluginESMImporter,
} from "./types.js";

function describePluginEntry(entry: BuilderPluginConfigEntry): string {
  if (typeof entry === "string") return entry;
  if (isBuiltinBuilderPluginDescriptor(entry)) return entry.plugin;
  if (isPluginESMImporter(entry)) return "lazy ESM importer";
  return entry.name ? `inline plugin "${entry.name}"` : "inline plugin";
}

export function toSerializablePluginConfigEntry(
  entry: BuilderPluginConfigEntry,
): BuilderPluginConfigEntry {
  if (typeof entry === "string" || isBuiltinBuilderPluginDescriptor(entry)) {
    return entry;
  }

  if (isPluginESMImporter(entry)) {
    throw new Error(
      "Cluster mode cannot serialize plugin importer functions. " +
        "Use a string plugin specifier or a built-in plugin descriptor instead.",
    );
  }

  if (entry.serializablePluginReference) {
    return entry.serializablePluginReference;
  }

  throw new Error(
    `Cluster mode cannot serialize ${describePluginEntry(entry)}. ` +
      "Use a string plugin specifier, a built-in plugin descriptor, or disable cluster mode.",
  );
}

export function createSerializableBuilderConfigForWorker(
  config: BuilderConfig,
): BuilderConfig {
  return {
    ...config,
    plugins: config.plugins.map(toSerializablePluginConfigEntry),
  };
}
