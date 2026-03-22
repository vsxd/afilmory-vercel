import type { AfilmoryManifest } from './types'
import { CURRENT_MANIFEST_VERSION } from './version'

export function createEmptyManifest(): AfilmoryManifest {
  return {
    version: CURRENT_MANIFEST_VERSION,
    data: [],
    cameras: [],
    lenses: [],
  }
}

export function parseManifest(input?: unknown): AfilmoryManifest {
  if (!input || typeof input !== 'object') {
    return createEmptyManifest()
  }

  const manifest = input as Partial<AfilmoryManifest>

  return {
    version: typeof manifest.version === 'string' ? manifest.version : CURRENT_MANIFEST_VERSION,
    data: Array.isArray(manifest.data) ? manifest.data : [],
    cameras: Array.isArray(manifest.cameras) ? manifest.cameras : [],
    lenses: Array.isArray(manifest.lenses) ? manifest.lenses : [],
  }
}
