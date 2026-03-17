import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from './types'

export class PhotoLoader {
  private readonly photos: PhotoManifestItem[]
  private readonly photoMap: Record<string, PhotoManifestItem>
  private readonly cameras: CameraInfo[]
  private readonly lenses: LensInfo[]

  constructor(manifest: AfilmoryManifest | null) {
    this.photos = manifest?.data ?? []
    this.cameras = manifest?.cameras ?? []
    this.lenses = manifest?.lenses ?? []

    this.photoMap = this.photos.reduce<Record<string, PhotoManifestItem>>((acc, photo) => {
      if (photo?.id) {
        acc[photo.id] = photo
      }
      return acc
    }, {})

    if (!manifest) {
      console.error('[PhotoLoader] __MANIFEST__ is not defined. Make sure manifest-inject plugin is working correctly.')
      return
    }

    console.info(`[PhotoLoader] Loaded ${this.photos.length} photos from manifest`)
  }

  getPhotos(): PhotoManifestItem[] {
    return this.photos
  }

  getPhoto(id: string): PhotoManifestItem | undefined {
    return this.photoMap[id]
  }

  getAllTags(): string[] {
    const tagSet = new Set<string>()
    for (const photo of this.photos) {
      for (const tag of photo.tags) {
        tagSet.add(tag)
      }
    }

    return [...tagSet].sort()
  }

  getAllCameras(): CameraInfo[] {
    return this.cameras
  }

  getAllLenses(): LensInfo[] {
    return this.lenses
  }
}

export function createPhotoLoader(manifest: AfilmoryManifest | null): PhotoLoader {
  return new PhotoLoader(manifest)
}
