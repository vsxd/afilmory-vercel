import { createPhotoLoader } from './photo-loader'
import { resolveRuntimeManifest } from './runtime-manifest'
import type { AfilmoryManifest } from './types'

export { createPhotoLoader, PhotoLoader } from './photo-loader'
export { resolveRuntimeManifest } from './runtime-manifest'

export const photoLoader = createPhotoLoader(resolveRuntimeManifest())

export function createRuntimePhotoLoader(manifest?: AfilmoryManifest | null) {
  if (arguments.length > 0) {
    return createPhotoLoader(manifest ?? null)
  }

  return createPhotoLoader(resolveRuntimeManifest())
}
