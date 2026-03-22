import { LoadingState } from '@afilmory/webgl-viewer'
import type { TFunction } from 'i18next'
import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { MenuItemSeparator, MenuItemText } from '~/atoms/context-menu'
import { isMobileDevice } from '~/lib/device-viewport'
import { ImageLoaderManager } from '~/lib/image-loader-manager'
import { getImageFormat } from '~/lib/image-utils'

import type { LivePhotoVideoHandle } from './LivePhotoVideo'
import type { LoadingIndicatorRef } from './LoadingIndicator'
import type { HighResSourceKind, ProgressiveImageState } from './types'
import { SHOW_SCALE_INDICATOR_DURATION } from './types'

const DIRECT_RENDERABLE_IMAGE_FORMATS = new Set(['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF'])

export const useProgressiveImageState = (): [
  ProgressiveImageState,
  {
    setResolvedSrc: (src: string | null) => void
    setSourceKind: (kind: HighResSourceKind | null) => void
    setLoadPhase: (phase: ProgressiveImageState['loadPhase']) => void
    setCurrentScale: (scale: number) => void
    setShowScaleIndicator: (show: boolean) => void
    setIsThumbnailLoaded: (loaded: boolean) => void
    setIsLivePhotoPlaying: (playing: boolean) => void
  },
] => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
  const [sourceKind, setSourceKind] = useState<HighResSourceKind | null>(null)
  const [loadPhase, setLoadPhase] = useState<ProgressiveImageState['loadPhase']>('idle')
  const [currentScale, setCurrentScale] = useState(1)
  const [showScaleIndicator, setShowScaleIndicator] = useState(false)
  const [isThumbnailLoaded, setIsThumbnailLoaded] = useState(false)
  const [isLivePhotoPlaying, setIsLivePhotoPlaying] = useState(false)

  return [
    {
      resolvedSrc,
      sourceKind,
      loadPhase,
      currentScale,
      showScaleIndicator,
      isThumbnailLoaded,
      isLivePhotoPlaying,
    },
    {
      setResolvedSrc,
      setSourceKind,
      setLoadPhase,
      setCurrentScale,
      setShowScaleIndicator,
      setIsThumbnailLoaded,
      setIsLivePhotoPlaying,
    },
  ]
}

export const useImageLoader = (
  src: string,
  isCurrentImage: boolean,
  onProgress?: (progress: number) => void,
  onError?: () => void,
  onBlobSrcChange?: (blobSrc: string | null) => void,
  loadingIndicatorRef?: React.RefObject<LoadingIndicatorRef | null>,
  setResolvedSrc?: (src: string | null) => void,
  setSourceKind?: (kind: HighResSourceKind | null) => void,
  setLoadPhase?: (phase: ProgressiveImageState['loadPhase']) => void,
) => {
  const { t } = useTranslation()
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null)

  useEffect(() => {
    const resetState = () => {
      setResolvedSrc?.(null)
      setSourceKind?.(null)
      setLoadPhase?.('idle')
      onBlobSrcChange?.(null)

      // Reset loading indicator
      loadingIndicatorRef?.current?.resetLoadingState()
    }

    if (!isCurrentImage) {
      resetState()
      imageLoaderManagerRef.current?.cleanup()
      imageLoaderManagerRef.current = null
      return
    }

    // Create new image loader manager
    const imageLoaderManager = new ImageLoaderManager()
    imageLoaderManagerRef.current = imageLoaderManager

    const isCrossOriginSource = (() => {
      try {
        return new URL(src, window.location.href).origin !== window.location.origin
      } catch {
        return false
      }
    })()
    const shouldUseDirectCrossOriginImage =
      isCrossOriginSource && DIRECT_RENDERABLE_IMAGE_FORMATS.has(getImageFormat(src))

    if (shouldUseDirectCrossOriginImage) {
      loadingIndicatorRef?.current?.updateLoadingState({
        isVisible: true,
        loadingProgress: 0,
        loadedBytes: 0,
        totalBytes: 0,
      })
      setResolvedSrc?.(src)
      setSourceKind?.('direct')
      setLoadPhase?.('loading')
      onBlobSrcChange?.(src)
      return () => {
        imageLoaderManager.cleanup()
      }
    }

    const loadImage = async () => {
      try {
        const result = await imageLoaderManager.loadImage(src, {
          onProgress,
          onError,
          onLoadingStateUpdate: (state) => {
            loadingIndicatorRef?.current?.updateLoadingState(state)
          },
        })

        setResolvedSrc?.(result.blobSrc)
        setSourceKind?.(result.blobSrc.startsWith('blob:') ? 'blob' : 'direct')
        setLoadPhase?.('ready')
        onBlobSrcChange?.(result.blobSrc)
      } catch (loadError) {
        if (isCrossOriginSource) {
          loadingIndicatorRef?.current?.updateLoadingState({
            isVisible: true,
            loadingProgress: 0,
            loadedBytes: 0,
            totalBytes: 0,
          })
          setResolvedSrc?.(src)
          setSourceKind?.('direct')
          setLoadPhase?.('loading')
          onBlobSrcChange?.(src)
          return
        }

        console.error('Failed to load image:', loadError)
        setLoadPhase?.('error')

        // 显示错误状态，而不是完全隐藏图片
        loadingIndicatorRef?.current?.updateLoadingState({
          isVisible: true,
          isError: true,
          errorMessage: t('photo.error.loading'),
        })
      }
    }

    resetState()
    loadImage()

    return () => {
      imageLoaderManager.cleanup()
    }
  }, [
    onProgress,
    src,
    onError,
    isCurrentImage,
    onBlobSrcChange,
    loadingIndicatorRef,
    t,
    setResolvedSrc,
    setSourceKind,
    setLoadPhase,
  ])

  return imageLoaderManagerRef
}

export const useScaleIndicator = (
  onZoomChange?: (isZoomed: boolean) => void,
  setCurrentScale?: (scale: number) => void,
  setShowScaleIndicator?: (show: boolean) => void,
) => {
  const scaleIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleScaleChange = useCallback(
    (scale: number, isZoomed: boolean) => {
      // 更新缩放倍率并显示提示
      startTransition(() => {
        setCurrentScale?.(scale)
        setShowScaleIndicator?.(true)
      })

      // 清除之前的定时器
      if (scaleIndicatorTimeoutRef.current) {
        clearTimeout(scaleIndicatorTimeoutRef.current)
      }

      scaleIndicatorTimeoutRef.current = setTimeout(() => {
        setShowScaleIndicator?.(false)
      }, SHOW_SCALE_INDICATOR_DURATION)

      onZoomChange?.(isZoomed)
    },
    [onZoomChange, setCurrentScale, setShowScaleIndicator],
  )

  // WebGL Image Viewer 的缩放变化处理
  const onTransformed = useCallback(
    (originalScale: number, relativeScale: number) => {
      const isZoomed = Math.abs(relativeScale - 1) > 0.01
      handleScaleChange(originalScale, isZoomed)
    },
    [handleScaleChange],
  )

  // DOM Image Viewer 的缩放变化处理
  const onDOMTransformed = useCallback(
    (isZoomed: boolean, scale: number) => {
      handleScaleChange(scale, isZoomed)
    },
    [handleScaleChange],
  )

  return { onTransformed, onDOMTransformed }
}

export const useLivePhotoControls = (
  isLivePhoto: boolean,
  isLivePhotoPlaying: boolean,
  livePhotoRef: React.RefObject<LivePhotoVideoHandle | null>,
) => {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleLongPressStart = useCallback(() => {
    if (!isMobileDevice) return
    const playVideo = () => livePhotoRef.current?.play()
    if (!isLivePhoto || !livePhotoRef.current?.getIsVideoLoaded() || isLivePhotoPlaying) {
      return
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = setTimeout(playVideo, 200)
  }, [isLivePhoto, isLivePhotoPlaying, livePhotoRef])

  const handleLongPressEnd = useCallback(() => {
    if (!isMobileDevice) return
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    if (isLivePhotoPlaying) {
      livePhotoRef.current?.stop()
    }
  }, [isLivePhotoPlaying, livePhotoRef])

  return { handleLongPressStart, handleLongPressEnd }
}

export const useWebGLLoadingState = (loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>) => {
  const { t } = useTranslation()

  const handleWebGLLoadingStateChange = useCallback(
    (isLoading: boolean, state?: LoadingState, quality?: 'high' | 'medium' | 'low' | 'unknown') => {
      let message = ''

      if (state === LoadingState.CREATE_TEXTURE) {
        message = t('photo.webgl.creatingTexture')
      } else if (state === LoadingState.IMAGE_LOADING) {
        message = t('photo.webgl.loadingImage')
      }

      loadingIndicatorRef.current?.updateLoadingState({
        isVisible: isLoading,
        isWebGLLoading: isLoading,
        webglMessage: message,
        webglQuality: quality,
      })
    },
    [t, loadingIndicatorRef],
  )

  return handleWebGLLoadingStateChange
}

export const createContextMenuItems = (blobSrc: string, alt: string, t: TFunction<'app', undefined>) => [
  new MenuItemText({
    label: t('photo.copy.image'),
    click: async () => {
      const loadingToast = toast.loading(t('photo.copying'))

      try {
        // Create a canvas to convert the image to PNG
        const img = new Image()
        img.crossOrigin = 'anonymous'

        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = blobSrc
        })

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        ctx?.drawImage(img, 0, 0)

        // Convert to PNG blob
        await new Promise<void>((resolve, reject) => {
          canvas.toBlob(async (pngBlob) => {
            try {
              if (pngBlob) {
                await navigator.clipboard.write([
                  new ClipboardItem({
                    'image/png': pngBlob,
                  }),
                ])
                resolve()
              } else {
                reject(new Error('Failed to convert image to PNG'))
              }
            } catch (error) {
              reject(error)
            }
          }, 'image/png')
        })

        toast.dismiss(loadingToast)
        toast.success(t('photo.copy.success'))
      } catch (error) {
        console.error('Failed to copy image:', error)

        // Fallback: try to copy the original blob
        try {
          const blob = await fetch(blobSrc).then((res) => res.blob())
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ])
          toast.dismiss(loadingToast)
          toast.success(t('photo.copy.success'))
        } catch (fallbackError) {
          console.error('Fallback copy also failed:', fallbackError)
          toast.dismiss(loadingToast)
          toast.error(t('photo.copy.error'))
        }
      }
    },
  }),
  MenuItemSeparator.default,
  new MenuItemText({
    label: t('photo.download'),
    click: () => {
      const a = document.createElement('a')
      a.href = blobSrc
      a.download = alt
      a.click()
    },
  }),
]
