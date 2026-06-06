import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuilderOutputSettings } from "./types/config.js";

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

// Singleton — must be initialised exactly once via setBuilderOutputSettings()
// before any call to getBuilderOutputSettings(). AfilmoryBuilder constructor
// handles this. Do NOT instantiate multiple builders in the same process.
let currentOutputSettings: BuilderOutputSettings | null = null;

export function setBuilderOutputSettings(output: BuilderOutputSettings): void {
  const manifestPath = path.resolve(output.manifestPath);

  currentOutputSettings = {
    manifestPath,
    thumbnailsDir: path.resolve(output.thumbnailsDir),
    originalsDir: path.resolve(output.originalsDir),
    geocodingCachePath: path.resolve(
      output.geocodingCachePath ??
        path.join(path.dirname(manifestPath), "geocoding-cache.json"),
    ),
  };
}

export function getBuilderOutputSettings(): BuilderOutputSettings {
  if (!currentOutputSettings) {
    throw new Error(
      "[builder] Output settings have not been initialised. " +
        "Ensure AfilmoryBuilder is constructed before accessing output paths.",
    );
  }
  return currentOutputSettings;
}
