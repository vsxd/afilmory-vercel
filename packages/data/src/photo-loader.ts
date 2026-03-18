import { collectSortedTags, createPhotoMap } from './manifest-queries'
import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from './types'

export type PhotoLoaderLogger = Pick<typeof console, 'error' | 'info'>

const defaultPhotoLoaderLogger: PhotoLoaderLogger = console

export class PhotoLoader {
  private readonly photos: PhotoManifestItem[]
  private readonly photoMap: Record<string, PhotoManifestItem>
  private readonly cameras: CameraInfo[]
  private readonly lenses: LensInfo[]

  constructor(
    manifest: AfilmoryManifest | null,
    private readonly logger: PhotoLoaderLogger = defaultPhotoLoaderLogger,
  ) {
    this.photos = manifest?.data ?? []
    this.cameras = manifest?.cameras ?? []
    this.lenses = manifest?.lenses ?? []
    this.photoMap = createPhotoMap(this.photos)

    if (!manifest) {
      this.logger.error(
        '[PhotoLoader] __MANIFEST__ is not defined. Make sure manifest-inject plugin is working correctly.',
      )
      return
    }

    this.logger.info(`[PhotoLoader] Loaded ${this.photos.length} photos from manifest`)
  }

  getPhotos(): PhotoManifestItem[] {
    return this.photos
  }

  getPhoto(id: string): PhotoManifestItem | undefined {
    return this.photoMap[id]
  }

  getAllTags(): string[] {
    return collectSortedTags(this.photos)
  }

  getAllCameras(): CameraInfo[] {
    return this.cameras
  }

  getAllLenses(): LensInfo[] {
    return this.lenses
  }
}

export function createPhotoLoader(manifest: AfilmoryManifest | null, logger?: PhotoLoaderLogger): PhotoLoader {
  return new PhotoLoader(manifest, logger)
}
