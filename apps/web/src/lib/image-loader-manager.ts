import type { VideoSource } from '~/components/ui/photo-viewer/types'
import { i18nAtom } from '~/i18n'
import { debugLog } from '~/lib/debug-log'
import { detectFileTypeFromBlob } from '~/lib/file-type'
import { imageConverterManager } from '~/lib/image-convert'
import { jotaiStore } from '~/lib/jotai'
import { LRUCache } from '~/lib/lru-cache'
import { extractMotionPhotoVideo } from '~/lib/motion-photo-extractor'
import { convertMovToMp4, needsVideoConversion } from '~/lib/video-converter'

export interface LoadingState {
  isVisible: boolean
  isHeicFormat?: boolean
  loadingProgress?: number
  loadedBytes?: number
  totalBytes?: number
  isConverting?: boolean
  isQueueWaiting?: boolean
  conversionMessage?: string
  codecInfo?: string
}

export interface LoadingCallbacks {
  onProgress?: (progress: number) => void
  onError?: () => void
  onLoadingStateUpdate?: (state: Partial<LoadingState>) => void
}

export interface ImageLoadResult {
  blobSrc: string
  convertedUrl?: string
}

export interface VideoProcessResult {
  convertedVideoUrl?: string
  conversionMethod?: string
}

export interface ImageCacheResult {
  blobSrc: string
  originalSize: number
  format: string
}

function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

// Regular image cache using LRU cache
const regularImageCache: LRUCache<string, ImageCacheResult> = new LRUCache<string, ImageCacheResult>(
  50, // Cache size for regular images
  (value, _key, reason) => {
    try {
      URL.revokeObjectURL(value.blobSrc)
      debugLog(`Regular image cache: Revoked blob URL - ${reason}`)
    } catch (error) {
      console.warn(`Failed to revoke regular image blob URL (${reason}):`, error)
    }
  },
)

/**
 * 生成普通图片的缓存键
 */
function generateRegularImageCacheKey(url: string): string {
  // 使用原始 URL 作为唯一键
  return url
}

export class ImageLoaderManager {
  private currentXHR: XMLHttpRequest | null = null
  private delayTimer: NodeJS.Timeout | null = null
  private pendingLoadReject: ((reason?: unknown) => void) | null = null
  private pendingVideoReject: ((reason?: unknown) => void) | null = null
  private pendingVideoCleanup: (() => void) | null = null
  private currentVideoAbortController: AbortController | null = null
  private activeVideoElement: HTMLVideoElement | null = null
  private ownedVideoUrl: string | null = null

  private rejectPendingVideo(error: Error): void {
    if (this.pendingVideoReject) {
      const rejectVideo = this.pendingVideoReject
      this.pendingVideoReject = null
      rejectVideo(error)
    }
  }

  private clearVideoElement(): void {
    this.rejectPendingVideo(createAbortError('Video load cancelled'))

    if (this.pendingVideoCleanup) {
      this.pendingVideoCleanup()
      this.pendingVideoCleanup = null
    }

    const videoElement = this.activeVideoElement
    if (videoElement) {
      try {
        videoElement.pause()
      } catch (error) {
        console.warn('Failed to pause video during cleanup:', error)
      }

      videoElement.removeAttribute('src')
      videoElement.load()
    }

    if (this.ownedVideoUrl) {
      try {
        URL.revokeObjectURL(this.ownedVideoUrl)
        debugLog('Revoked owned video blob URL during cleanup')
      } catch (error) {
        console.warn('Failed to revoke owned video blob URL:', error)
      }
    }

    this.activeVideoElement = null
    this.ownedVideoUrl = null
  }

  private setVideoSource(videoElement: HTMLVideoElement, src: string, options: { ownedBlobUrl?: boolean } = {}): void {
    this.clearVideoElement()
    this.activeVideoElement = videoElement
    this.ownedVideoUrl = options.ownedBlobUrl ? src : null
    videoElement.src = src
    videoElement.load()
  }

  private waitForVideoReady(videoElement: HTMLVideoElement, result: VideoProcessResult): Promise<VideoProcessResult> {
    return new Promise((resolve, reject) => {
      this.pendingVideoReject = reject

      const cleanup = () => {
        videoElement.removeEventListener('canplaythrough', handleVideoCanPlay)
        videoElement.removeEventListener('error', handleVideoError)
        if (this.pendingVideoCleanup === cleanup) {
          this.pendingVideoCleanup = null
        }
        if (this.pendingVideoReject === reject) {
          this.pendingVideoReject = null
        }
      }

      const handleVideoCanPlay = () => {
        cleanup()
        resolve(result)
      }

      const handleVideoError = () => {
        cleanup()
        reject(new Error('Video failed to load'))
      }

      this.pendingVideoCleanup = cleanup

      videoElement.addEventListener('canplaythrough', handleVideoCanPlay)
      videoElement.addEventListener('error', handleVideoError)
    })
  }

  /**
   * 验证 Blob 是否为有效的图片格式
   * 使用 magic number 检测文件类型，而不是依赖 MIME 类型
   */
  private async isValidImageBlob(blob: Blob): Promise<boolean> {
    // 检查文件大小（至少应该有一些字节）
    if (blob.size === 0) {
      console.warn('Empty blob detected')
      return false
    }

    try {
      // 使用 magic number 检测文件类型
      const fileType = await detectFileTypeFromBlob(blob)

      if (!fileType) {
        console.warn('Could not detect file type from blob')
        return false
      }

      // 检查是否为图片格式
      const isValidImage = fileType.mime.startsWith('image/')

      if (!isValidImage) {
        console.warn(`Invalid file type detected: ${fileType.ext} (${fileType.mime})`)
        return false
      }

      debugLog(`Valid image detected: ${fileType.ext} (${fileType.mime})`)
      return true
    } catch (error) {
      console.error('Failed to detect file type:', error)
      return false
    }
  }

  async loadImage(src: string, callbacks: LoadingCallbacks = {}): Promise<ImageLoadResult> {
    const { onProgress, onError, onLoadingStateUpdate } = callbacks

    // Show loading indicator
    onLoadingStateUpdate?.({
      isVisible: true,
    })

    return new Promise((resolve, reject) => {
      this.pendingLoadReject = reject

      const resolveLoad = (result: ImageLoadResult) => {
        if (this.pendingLoadReject === reject) {
          this.pendingLoadReject = null
        }
        resolve(result)
      }

      const rejectLoad = (error: unknown) => {
        if (this.pendingLoadReject === reject) {
          this.pendingLoadReject = null
        }
        reject(error)
      }

      this.delayTimer = setTimeout(async () => {
        this.delayTimer = null
        const xhr = new XMLHttpRequest()
        xhr.open('GET', src)
        xhr.responseType = 'blob'
        // Set high priority for high-res images via HTTP/2 Priority header
        xhr.setRequestHeader('Priority', 'u=0, i')
        this.currentXHR = xhr

        xhr.onload = async () => {
          if (this.currentXHR === xhr) {
            this.currentXHR = null
          }

          if (xhr.status === 200) {
            try {
              // 验证响应是否为图片
              const blob = xhr.response as Blob
              if (!(await this.isValidImageBlob(blob))) {
                onLoadingStateUpdate?.({
                  isVisible: false,
                })
                onError?.()
                rejectLoad(new Error('Response is not a valid image'))
                return
              }

              const result = await this.processImageBlob(
                blob,
                src, // 传递原始 URL
                callbacks,
              )
              resolveLoad(result)
            } catch (error) {
              onLoadingStateUpdate?.({
                isVisible: false,
              })
              onError?.()
              rejectLoad(error)
            }
          } else {
            onLoadingStateUpdate?.({
              isVisible: false,
            })
            onError?.()
            rejectLoad(new Error(`HTTP ${xhr.status}`))
          }
        }

        xhr.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100

            // Update loading progress
            onLoadingStateUpdate?.({
              loadingProgress: progress,
              loadedBytes: e.loaded,
              totalBytes: e.total,
            })

            onProgress?.(progress)
          }
        }

        xhr.onabort = () => {
          if (this.currentXHR === xhr) {
            this.currentXHR = null
          }

          onLoadingStateUpdate?.({
            isVisible: false,
          })

          rejectLoad(createAbortError('Image load cancelled'))
        }

        xhr.onerror = () => {
          if (this.currentXHR === xhr) {
            this.currentXHR = null
          }

          // Hide loading indicator on error
          onLoadingStateUpdate?.({
            isVisible: false,
          })

          onError?.()
          rejectLoad(new Error('Network error'))
        }

        xhr.send()
      }, 300)
    })
  }

  /**
   * 处理视频（Live Photo 或 Motion Photo）
   */
  async processVideo(
    videoSource: VideoSource,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks = {},
  ): Promise<VideoProcessResult> {
    const { onLoadingStateUpdate } = callbacks
    const i18n = jotaiStore.get(i18nAtom)

    this.currentVideoAbortController?.abort()
    this.currentVideoAbortController = new AbortController()

    try {
      if (videoSource.type === 'motion-photo') {
        debugLog('Processing Motion Photo embedded video...')
        onLoadingStateUpdate?.({
          isVisible: true,
          conversionMessage: i18n.t('video.motion-photo.extracting'),
        })

        const extractedVideoUrl = await extractMotionPhotoVideo(
          videoSource.imageUrl,
          {
            motionPhotoOffset: videoSource.offset,
            motionPhotoVideoSize: videoSource.size,
            presentationTimestampUs: videoSource.presentationTimestamp,
          },
          this.currentVideoAbortController.signal,
        )

        if (!extractedVideoUrl) {
          throw new Error('Failed to extract Motion Photo video')
        }

        this.setVideoSource(videoElement, extractedVideoUrl, { ownedBlobUrl: true })
        debugLog('Motion Photo video extracted successfully')
        onLoadingStateUpdate?.({
          isVisible: false,
        })

        return await this.waitForVideoReady(videoElement, {
          convertedVideoUrl: extractedVideoUrl,
          conversionMethod: 'motion-photo-extraction',
        })
      }

      if (videoSource.type === 'live-photo') {
        if (needsVideoConversion(videoSource.videoUrl)) {
          return await this.convertVideo(videoSource.videoUrl, videoElement, callbacks)
        }

        return await this.loadDirectVideo(videoSource.videoUrl, videoElement)
      }

      throw new Error('No video source provided')
    } catch (error) {
      console.error('Failed to process video:', error)
      onLoadingStateUpdate?.({
        isVisible: false,
      })
      throw error
    }
  }

  private async processImageBlob(
    blob: Blob,
    originalUrl: string,
    callbacks: LoadingCallbacks,
  ): Promise<ImageLoadResult> {
    const { onError: _onError, onLoadingStateUpdate } = callbacks

    try {
      // 使用策略模式检测并转换图像
      const conversionResult = await imageConverterManager.convertImage(blob, originalUrl, callbacks)

      if (conversionResult) {
        // 需要转换的格式
        debugLog(
          `Image converted: ${(blob.size / 1024).toFixed(1)}KB → ${(conversionResult.convertedSize / 1024).toFixed(1)}KB`,
        )

        // Hide loading indicator
        onLoadingStateUpdate?.({
          isVisible: false,
        })

        return {
          blobSrc: conversionResult.url,
          convertedUrl: conversionResult.url,
        }
      } else {
        // 不需要转换的普通图片
        return this.processRegularImage(blob, originalUrl, callbacks)
      }
    } catch (conversionError) {
      console.error('Image conversion failed:', conversionError)

      // 转换失败时，尝试按普通图片处理
      try {
        debugLog('Falling back to regular image processing')
        return this.processRegularImage(blob, originalUrl, callbacks)
      } catch (fallbackError) {
        console.error('Fallback to regular image processing also failed:', fallbackError)

        // Hide loading indicator on error
        onLoadingStateUpdate?.({
          isVisible: false,
        })

        _onError?.()
        throw conversionError
      }
    }
  }

  private processRegularImage(
    blob: Blob,
    originalUrl: string, // 添加原始 URL 参数
    callbacks: LoadingCallbacks,
  ): ImageLoadResult {
    const { onLoadingStateUpdate } = callbacks

    // 生成缓存键
    const cacheKey = generateRegularImageCacheKey(originalUrl) // 使用原始 URL

    // 检查缓存
    const cachedResult = regularImageCache.get(cacheKey)
    if (cachedResult) {
      debugLog('Using cached regular image result', cachedResult)

      // Hide loading indicator
      onLoadingStateUpdate?.({
        isVisible: false,
      })

      return {
        blobSrc: cachedResult.blobSrc,
      }
    }

    // 普通图片格式
    const url = URL.createObjectURL(blob)

    const result: ImageCacheResult = {
      blobSrc: url,
      originalSize: blob.size,
      format: blob.type,
    }

    // 缓存结果
    regularImageCache.set(cacheKey, result)
    debugLog(`Regular image processed and cached: ${(blob.size / 1024).toFixed(1)}KB, URL: ${originalUrl}`)

    // Hide loading indicator
    onLoadingStateUpdate?.({
      isVisible: false,
    })

    return {
      blobSrc: url,
    }
  }

  private async convertVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks,
  ): Promise<VideoProcessResult> {
    const { onLoadingStateUpdate } = callbacks

    // 更新加载指示器显示转换进度
    onLoadingStateUpdate?.({
      isVisible: true,
      isConverting: true,
      loadingProgress: 0,
    })

    debugLog('Converting MOV video to MP4...')

    const i18n = jotaiStore.get(i18nAtom)

    const result = await convertMovToMp4(
      livePhotoVideoUrl,
      (progress) => {
        // 检查是否包含编码器信息（支持多语言）
        const codecKeywords: string[] = [
          i18n.t('video.codec.keyword'), // 翻译键
          'encoder',
          'codec',
          '编码器', // 备用关键词
        ]
        const isCodecInfo = codecKeywords.some((keyword: string) =>
          progress.message.toLowerCase().includes(keyword.toLowerCase()),
        )

        onLoadingStateUpdate?.({
          isVisible: true,
          isConverting: progress.isConverting,
          loadingProgress: progress.progress,
          conversionMessage: progress.message,
          codecInfo: isCodecInfo ? progress.message : undefined,
        })
      },
      false,
      { signal: this.currentVideoAbortController?.signal },
    )

    if (result.success && result.videoUrl) {
      const convertedVideoUrl = result.videoUrl

      this.setVideoSource(videoElement, result.videoUrl)

      debugLog(
        `Video conversion completed. Size: ${result.convertedSize ? Math.round(result.convertedSize / 1024) : 'unknown'}KB`,
      )

      onLoadingStateUpdate?.({
        isVisible: false,
      })

      return await this.waitForVideoReady(videoElement, {
        convertedVideoUrl,
      })
    } else {
      console.error('Video conversion failed:', result.error)
      onLoadingStateUpdate?.({
        isVisible: false,
      })
      throw new Error(result.error || 'Video conversion failed')
    }
  }

  private async loadDirectVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
  ): Promise<VideoProcessResult> {
    // 直接使用原始视频
    this.setVideoSource(videoElement, livePhotoVideoUrl)

    return await this.waitForVideoReady(videoElement, {
      conversionMethod: '',
    })
  }

  cleanup() {
    // 清理定时器
    if (this.delayTimer) {
      clearTimeout(this.delayTimer)
      this.delayTimer = null

      if (this.pendingLoadReject) {
        const rejectLoad = this.pendingLoadReject
        this.pendingLoadReject = null
        rejectLoad(createAbortError('Image load cancelled'))
      }
    }

    // 取消正在进行的请求
    if (this.currentXHR) {
      this.currentXHR.abort()
      this.currentXHR = null
    }

    if (this.currentVideoAbortController) {
      this.currentVideoAbortController.abort()
      this.currentVideoAbortController = null
    }

    if (this.pendingVideoReject) {
      this.rejectPendingVideo(createAbortError('Video load cancelled'))
    }

    this.clearVideoElement()
  }
}

// Regular image cache management functions
export function getRegularImageCacheSize(): number {
  return regularImageCache.size()
}

export function clearRegularImageCache(): void {
  regularImageCache.clear()
}

export function removeRegularImageCache(cacheKey: string): boolean {
  return regularImageCache.delete(cacheKey)
}

export function getRegularImageCacheStats(): {
  size: number
  maxSize: number
  keys: string[]
} {
  return regularImageCache.getStats()
}

/**
 * 根据原始 URL 移除特定的普通图片缓存项
 */
export function removeRegularImageCacheByUrl(originalUrl: string): boolean {
  const cacheKey = generateRegularImageCacheKey(originalUrl)
  return regularImageCache.delete(cacheKey)
}
