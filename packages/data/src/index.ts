import { createPhotoLoader } from './photo-loader'
import { resolveRuntimeManifest } from './runtime-manifest'
import type { AfilmoryManifest } from './types'

export { collectSortedTags, createPhotoMap } from './manifest-queries'
export { createPhotoLoader, PhotoLoader } from './photo-loader'
export { resolveRuntimeManifest, resolveRuntimeManifestFrom } from './runtime-manifest'

export const photoLoader = createPhotoLoader(resolveRuntimeManifest())

export function createRuntimePhotoLoader(manifest?: AfilmoryManifest | null) {
  if (arguments.length > 0) {
    return createPhotoLoader(manifest ?? null)
  }

  return createPhotoLoader(resolveRuntimeManifest())
}
