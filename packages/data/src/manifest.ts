import type { AfilmoryManifest } from './types'

export function createEmptyManifest(): AfilmoryManifest {
  return {
    version: 'v8',
    data: [],
    cameras: [],
    lenses: [],
  }
}

export function parseManifest(input: unknown): AfilmoryManifest {
  if (!input || typeof input !== 'object') {
    return createEmptyManifest()
  }

  const manifest = input as Partial<AfilmoryManifest>

  return {
    version: typeof manifest.version === 'string' ? manifest.version : 'v8',
    data: Array.isArray(manifest.data) ? manifest.data : [],
    cameras: Array.isArray(manifest.cameras) ? manifest.cameras : [],
    lenses: Array.isArray(manifest.lenses) ? manifest.lenses : [],
  }
}
