import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from '@afilmory/data'
import { createEmptyManifest, parseManifest } from '@afilmory/data'

function getInjectedManifest(): AfilmoryManifest {
  try {
    const injected =
      typeof window !== 'undefined'
        ? (window as typeof window & { __MANIFEST__?: unknown }).__MANIFEST__
        : (globalThis as typeof globalThis & { __MANIFEST__?: unknown }).__MANIFEST__

    if (!injected) {
      if (typeof window !== 'undefined') {
        console.error('[PhotoLoader] __MANIFEST__ is not defined. Make sure data injection is working correctly.')
      }
      return createEmptyManifest()
    }

    return parseManifest(injected)
  } catch (error) {
    console.error('[PhotoLoader] Failed to read manifest:', error)
    return createEmptyManifest()
  }
}

class PhotoLoader {
  private photos: PhotoManifestItem[] = []
  private photoMap: Record<string, PhotoManifestItem> = {}
  private cameras: CameraInfo[] = []
  private lenses: LensInfo[] = []

  constructor(manifest: AfilmoryManifest) {
    this.photos = manifest.data
    this.cameras = manifest.cameras
    this.lenses = manifest.lenses

    for (const photo of this.photos) {
      if (photo?.id) {
        this.photoMap[photo.id] = photo
      }
    }

    console.info(`[PhotoLoader] Loaded ${this.photos.length} photos from manifest`)
  }

  getPhotos() {
    return this.photos
  }

  getPhoto(id: string): PhotoManifestItem | undefined {
    return this.photoMap[id]
  }

  getAllTags() {
    const tagSet = new Set<string>()
    for (const photo of this.photos) {
      for (const tag of photo.tags) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  }

  getAllCameras() {
    return this.cameras
  }

  getAllLenses() {
    return this.lenses
  }
}

export const photoLoader = new PhotoLoader(getInjectedManifest())
