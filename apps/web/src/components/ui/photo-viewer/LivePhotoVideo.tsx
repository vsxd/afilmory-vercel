import { clsxm } from '@afilmory/ui'
import { m, useAnimationControls } from 'motion/react'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import type { ImageLoaderManager } from '~/lib/image-loader-manager'

import type { LoadingIndicatorRef } from './LoadingIndicator'
import type { VideoSource } from './types'
import { getVideoSourceKey } from './types'

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function resetVideoElement(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) {
    return
  }

  videoElement.pause()
  videoElement.removeAttribute('src')
  videoElement.load()
}

interface LivePhotoVideoProps {
  /** Video source (Live Photo or Motion Photo) */
  videoSource: VideoSource
  /** 图片加载管理器实例 */
  imageLoaderManager: ImageLoaderManager
  /** 加载指示器引用 */
  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>
  /** 是否是当前图片 */
  isCurrentImage: boolean
  /** 自定义样式类名 */
  className?: string
  onPlayingChange?: (isPlaying: boolean) => void
  /** 是否自动播放一次 */
  shouldAutoPlayOnce?: boolean
}

export interface LivePhotoVideoHandle {
  play: () => void
  stop: () => void
  getIsVideoLoaded: () => boolean
}

export const LivePhotoVideo = ({
  ref,
  videoSource,
  imageLoaderManager,
  loadingIndicatorRef,
  isCurrentImage,
  className,
  onPlayingChange,
  shouldAutoPlayOnce = false,
}: LivePhotoVideoProps & {
  ref?: React.RefObject<LivePhotoVideoHandle | null>
}) => {
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false)
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false)
  const [isConvertingVideo, setIsConvertingVideo] = useState(false)
  const hasAutoPlayedRef = useRef(false)
  const isConvertingVideoRef = useRef(false)
  const loadedVideoSourceKeyRef = useRef<string | null>(null)
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const videoSourceType = videoSource.type
  const livePhotoUrl = videoSourceType === 'live-photo' ? videoSource.videoUrl : undefined
  const motionPhotoImageUrl = videoSourceType === 'motion-photo' ? videoSource.imageUrl : undefined
  const motionPhotoOffset = videoSourceType === 'motion-photo' ? videoSource.offset : undefined
  const motionPhotoSize = videoSourceType === 'motion-photo' ? videoSource.size : undefined
  const motionPhotoPresentationTimestamp =
    videoSourceType === 'motion-photo' ? videoSource.presentationTimestamp : undefined

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoAnimateController = useAnimationControls()
  const stableVideoSource = useMemo<VideoSource>(() => {
    if (videoSourceType === 'motion-photo') {
      return {
        type: 'motion-photo',
        imageUrl: motionPhotoImageUrl!,
        offset: motionPhotoOffset!,
        size: motionPhotoSize,
        presentationTimestamp: motionPhotoPresentationTimestamp,
      }
    }

    if (videoSourceType === 'live-photo') {
      return {
        type: 'live-photo',
        videoUrl: livePhotoUrl!,
      }
    }

    return { type: 'none' }
  }, [
    videoSourceType,
    livePhotoUrl,
    motionPhotoImageUrl,
    motionPhotoOffset,
    motionPhotoSize,
    motionPhotoPresentationTimestamp,
  ])
  const videoSourceKey = getVideoSourceKey(stableVideoSource)

  useEffect(() => {
    onPlayingChange?.(isPlayingLivePhoto)
  }, [isPlayingLivePhoto, onPlayingChange])

  useEffect(() => {
    isConvertingVideoRef.current = isConvertingVideo
  }, [isConvertingVideo])

  const clearPlayTimer = useCallback(() => {
    if (!playTimerRef.current) {
      return
    }

    clearTimeout(playTimerRef.current)
    playTimerRef.current = null
  }, [])

  useEffect(() => {
    if (!isCurrentImage || isConvertingVideoRef.current || !videoRef.current) {
      return
    }
    if (stableVideoSource.type === 'none' || loadedVideoSourceKeyRef.current === videoSourceKey) {
      return
    }

    let cancelled = false
    const currentVideoElement = videoRef.current
    loadedVideoSourceKeyRef.current = null
    hasAutoPlayedRef.current = false
    isConvertingVideoRef.current = true
    setLivePhotoVideoLoaded(false)
    setIsConvertingVideo(true)

    const processVideo = async () => {
      try {
        await imageLoaderManager.processVideo(stableVideoSource, currentVideoElement, {
          onLoadingStateUpdate: (state) => {
            loadingIndicatorRef.current?.updateLoadingState(state)
          },
        })

        if (!cancelled) {
          loadedVideoSourceKeyRef.current = videoSourceKey
          setLivePhotoVideoLoaded(true)
        }
      } catch (videoError) {
        if (!cancelled && !isAbortLikeError(videoError)) {
          console.error('Failed to process video:', videoError)
        }
      } finally {
        if (!cancelled) {
          isConvertingVideoRef.current = false
          setIsConvertingVideo(false)
        }
      }
    }

    void processVideo()

    return () => {
      cancelled = true
      isConvertingVideoRef.current = false
      imageLoaderManager.cleanup()
    }
  }, [isCurrentImage, videoSourceKey, stableVideoSource, imageLoaderManager, loadingIndicatorRef])

  useEffect(() => {
    if (!isCurrentImage) {
      clearPlayTimer()
      setIsPlayingLivePhoto(false)
      setLivePhotoVideoLoaded(false)
      isConvertingVideoRef.current = false
      loadedVideoSourceKeyRef.current = null
      setIsConvertingVideo(false)
      hasAutoPlayedRef.current = false

      videoAnimateController.set({ opacity: 0 })
      resetVideoElement(videoRef.current)
    }
  }, [isCurrentImage, videoAnimateController, clearPlayTimer])

  useEffect(() => {
    const currentVideoElement = videoRef.current

    return () => {
      clearPlayTimer()
      loadedVideoSourceKeyRef.current = null
      resetVideoElement(currentVideoElement)
    }
  }, [clearPlayTimer])

  const play = useCallback(async () => {
    if (!livePhotoVideoLoaded || isPlayingLivePhoto || isConvertingVideo) return
    setIsPlayingLivePhoto(true)

    clearPlayTimer()
    playTimerRef.current = setTimeout(async () => {
      playTimerRef.current = null
      await videoAnimateController.start({
        opacity: 1,
        transition: { duration: 0.15, ease: 'easeOut' },
      })
      const video = videoRef.current
      if (video) {
        video.currentTime = 0
        void video.play().catch((error: unknown) => {
          console.error('Failed to play live photo video:', error)
          setIsPlayingLivePhoto(false)
        })
      }
    }, 0)
  }, [livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo, videoAnimateController, clearPlayTimer])

  const stop = useCallback(async () => {
    if (!isPlayingLivePhoto) return

    clearPlayTimer()
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    await videoAnimateController.start({
      opacity: 0,
      transition: { duration: 0.2, ease: 'easeIn' },
    })
    setIsPlayingLivePhoto(false)
  }, [isPlayingLivePhoto, videoAnimateController, clearPlayTimer])

  // Auto-play effect - play once when video is loaded
  useEffect(() => {
    if (
      shouldAutoPlayOnce &&
      isCurrentImage &&
      livePhotoVideoLoaded &&
      !isPlayingLivePhoto &&
      !isConvertingVideo &&
      !hasAutoPlayedRef.current
    ) {
      hasAutoPlayedRef.current = true
      play()
    }
  }, [shouldAutoPlayOnce, isCurrentImage, livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo, play])

  useImperativeHandle(ref, () => ({
    play,
    stop,
    getIsVideoLoaded: () => livePhotoVideoLoaded,
  }))

  const handleVideoEnded = useCallback(() => {
    stop()
  }, [stop])

  return (
    <m.video
      ref={videoRef}
      className={clsxm('pointer-events-none absolute inset-0 z-10 h-full w-full object-contain', className)}
      style={{
        opacity: isPlayingLivePhoto ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
      }}
      muted
      playsInline
      onEnded={handleVideoEnded}
      initial={{ opacity: 0 }}
      animate={videoAnimateController}
    />
  )
}

LivePhotoVideo.displayName = 'LivePhotoVideo'
