import type { AfilmoryManifest, PhotoManifestItem } from './types'
import { CURRENT_MANIFEST_VERSION } from './version'

export function createEmptyManifest(): AfilmoryManifest {
  return {
    version: CURRENT_MANIFEST_VERSION,
    data: [],
    cameras: [],
    lenses: [],
  }
}

function stripUnsupportedExifFields(photo: PhotoManifestItem): PhotoManifestItem {
  if (!photo.exif || typeof photo.exif !== 'object' || !('Rating' in photo.exif)) {
    return photo
  }

  const exif = { ...(photo.exif as Record<string, unknown>) }
  delete exif.Rating

  return {
    ...photo,
    exif: exif as unknown as PhotoManifestItem['exif'],
  }
}

export function parseManifest(input?: unknown): AfilmoryManifest {
  if (!input || typeof input !== 'object') {
    return createEmptyManifest()
  }

  const manifest = input as Partial<AfilmoryManifest>

  return {
    version: typeof manifest.version === 'string' ? manifest.version : CURRENT_MANIFEST_VERSION,
    data: Array.isArray(manifest.data) ? manifest.data.map((photo) => stripUnsupportedExifFields(photo)) : [],
    cameras: Array.isArray(manifest.cameras) ? manifest.cameras : [],
    lenses: Array.isArray(manifest.lenses) ? manifest.lenses : [],
  }
}
