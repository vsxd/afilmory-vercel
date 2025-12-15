import type { CameraInfo, LensInfo, PhotoManifestItem } from './types'

class PhotoLoader {
  private photos: PhotoManifestItem[] = []
  private photoMap: Record<string, PhotoManifestItem> = {}
  private cameras: CameraInfo[] = []
  private lenses: LensInfo[] = []

  constructor() {
    this.getAllTags = this.getAllTags.bind(this)
    this.getAllCameras = this.getAllCameras.bind(this)
    this.getAllLenses = this.getAllLenses.bind(this)
    this.getPhotos = this.getPhotos.bind(this)
    this.getPhoto = this.getPhoto.bind(this)

    try {
      // 安全地访问 manifest 数据
      // 首先尝试从 window 对象获取（浏览器环境）
      let manifest: any = null
      if (typeof window !== 'undefined' && (window as any).__MANIFEST__) {
        manifest = (window as any).__MANIFEST__
      } else {
        // 回退到全局 __MANIFEST__（构建时注入的）
        try {
          manifest = __MANIFEST__
        } catch {
          // __MANIFEST__ 可能未定义，这是正常的错误处理
        }
      }

      if (!manifest) {
        console.error(
          '[PhotoLoader] __MANIFEST__ is not defined. Make sure manifest-inject plugin is working correctly.',
        )
        this.photos = []
        this.cameras = []
        this.lenses = []
        return
      }

      this.photos = (manifest?.data || []) as PhotoManifestItem[]
      this.cameras = (manifest?.cameras || []) as CameraInfo[]
      this.lenses = (manifest?.lenses || []) as LensInfo[]

      // 构建照片映射
      this.photos.forEach((photo) => {
        if (photo?.id) {
          this.photoMap[photo.id] = photo
        }
      })

      console.info(`[PhotoLoader] Loaded ${this.photos.length} photos from manifest`)
    } catch (error) {
      console.error('[PhotoLoader] Failed to initialize:', error)
      this.photos = []
      this.cameras = []
      this.lenses = []
    }
  }

  getPhotos() {
    return this.photos
  }

  getPhoto(id: string) {
    return this.photoMap[id]
  }

  getAllTags() {
    const tagSet = new Set<string>()
    this.photos.forEach((photo) => {
      photo.tags.forEach((tag) => tagSet.add(tag))
    })
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
