import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from '@afilmory/data'
import { createEmptyManifest } from '@afilmory/data'

import { debugLog } from '~/lib/debug-log'

class PhotoLoader {
  private photos: PhotoManifestItem[] = []
  private photoMap: Record<string, PhotoManifestItem> = {}
  private cameras: CameraInfo[] = []
  private lenses: LensInfo[] = []

  constructor(manifest: AfilmoryManifest = createEmptyManifest()) {
    this.replaceManifest(manifest)
  }

  replaceManifest(manifest: AfilmoryManifest) {
    this.photos = manifest.data
    this.photoMap = {}
    this.cameras = manifest.cameras
    this.lenses = manifest.lenses

    for (const photo of this.photos) {
      if (photo?.id) {
        this.photoMap[photo.id] = photo
      }
    }

    debugLog(`[PhotoLoader] Loaded ${this.photos.length} photos from manifest`)
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

export const photoLoader = new PhotoLoader()

export function initializePhotoLoader(manifest: AfilmoryManifest): void {
  photoLoader.replaceManifest(manifest)
}
