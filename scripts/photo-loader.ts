import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PhotoManifestItem } from '@afilmory/data'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(__dirname, '..')

class BuildTimePhotoLoader {
  private photos: PhotoManifestItem[] = []
  private photoMap: Record<string, PhotoManifestItem> = {}

  constructor() {
    try {
      const manifestPath = path.join(monorepoRoot, 'generated', 'photos-manifest.json')
      const manifestContent = readFileSync(manifestPath, 'utf-8')
      this.photos = JSON.parse(manifestContent).data as PhotoManifestItem[]

      this.photos.forEach((photo) => {
        this.photoMap[photo.id] = photo
      })

      console.info(`📚 Loaded ${this.photos.length} photos from manifest`)
    } catch (error) {
      console.error('❌ Failed to load photos manifest:', error)
      this.photos = []
    }
  }

  getPhotos() {
    return this.photos
  }

  getPhoto(id: string) {
    return this.photoMap[id]
  }
}

export const buildTimePhotoLoader = new BuildTimePhotoLoader()
