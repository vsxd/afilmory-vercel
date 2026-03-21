import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BuilderOutputSettings } from './types/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const monorepoRoot = path.resolve(__dirname, '../../..')
export const webAppDir = path.join(monorepoRoot, 'apps/web')

export function createDefaultOutputSettings(): BuilderOutputSettings {
  return {
    manifestPath: path.join(monorepoRoot, 'generated', 'photos-manifest.json'),
    thumbnailsDir: path.join(webAppDir, 'public', 'thumbnails'),
    originalsDir: path.join(webAppDir, 'public', 'originals'),
  }
}

// Singleton — must be initialised exactly once via setBuilderOutputSettings()
// before any call to getBuilderOutputSettings(). AfilmoryBuilder constructor
// handles this. Do NOT instantiate multiple builders in the same process.
let currentOutputSettings: BuilderOutputSettings | null = null

export function setBuilderOutputSettings(output: BuilderOutputSettings): void {
  currentOutputSettings = {
    manifestPath: path.resolve(output.manifestPath),
    thumbnailsDir: path.resolve(output.thumbnailsDir),
    originalsDir: path.resolve(output.originalsDir),
  }
}

export function getBuilderOutputSettings(): BuilderOutputSettings {
  if (!currentOutputSettings) {
    throw new Error(
      '[builder] Output settings have not been initialised. ' +
        'Ensure AfilmoryBuilder is constructed before accessing output paths.',
    )
  }
  return currentOutputSettings
}
