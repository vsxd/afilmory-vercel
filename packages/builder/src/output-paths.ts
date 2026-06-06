import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuilderOutputSettings } from "./types/config.js";

export type { BuilderOutputSettings } from "./types/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const monorepoRoot = path.resolve(__dirname, "../../..");
export const webAppDir = path.join(monorepoRoot, "apps/web");

export function createDefaultOutputSettings(): BuilderOutputSettings {
  const manifestPath = path.join(
    monorepoRoot,
    "generated",
    "photos-manifest.json",
  );

  return {
    manifestPath,
    thumbnailsDir: path.join(webAppDir, "public", "thumbnails"),
    originalsDir: path.join(webAppDir, "public", "originals"),
    geocodingCachePath: path.join(
      path.dirname(manifestPath),
      "geocoding-cache.json",
    ),
  };
}

const outputSettingsStorage = new AsyncLocalStorage<BuilderOutputSettings>();

export function normalizeBuilderOutputSettings(
  output: BuilderOutputSettings,
): BuilderOutputSettings {
  const manifestPath = path.resolve(output.manifestPath);

  return {
    manifestPath,
    thumbnailsDir: path.resolve(output.thumbnailsDir),
    originalsDir: path.resolve(output.originalsDir),
    geocodingCachePath: path.resolve(
      output.geocodingCachePath ??
        path.join(path.dirname(manifestPath), "geocoding-cache.json"),
    ),
  };
}

export function runWithBuilderOutputSettings<T>(
  output: BuilderOutputSettings,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return outputSettingsStorage.run(
    normalizeBuilderOutputSettings(output),
    callback,
  );
}

export function getScopedBuilderOutputSettings(): BuilderOutputSettings {
  const outputSettings = outputSettingsStorage.getStore();
  if (!outputSettings) {
    throw new Error(
      "[builder] Output settings are not available in the current builder runtime.",
    );
  }
  return outputSettings;
}
