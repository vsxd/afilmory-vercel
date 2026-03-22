import { useCallback, useEffect, useRef, useState } from 'react'

import { isMobileDevice } from '~/lib/device-viewport'
import { ImageLoaderManager } from '~/lib/image-loader-manager'
import type { PhotoManifest } from '~/types/photo'

interface UseLivePhotoHandlerProps {
  data: PhotoManifest
  imageLoaded: boolean
}

export const useLivePhotoHandler = ({ data, imageLoaded }: UseLivePhotoHandlerProps) => {
  const { id, video, originalUrl } = data
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false)
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false)
  const [isConvertingVideo, setIsConvertingVideo] = useState(false)
  const [videoConversionError, setVideoConversionError] = useState<unknown>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null)

  const hasVideo = video !== undefined

  useEffect(() => {
    setIsPlayingLivePhoto(false)
    setLivePhotoVideoLoaded(false)
    setIsConvertingVideo(false)
    setVideoConversionError(null)

    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [id])

  // Live Photo/Motion Photo video loading logic
  useEffect(() => {
    if (!video || !imageLoaded || livePhotoVideoLoaded || !videoRef.current) {
      return
    }

    const videoEl = videoRef.current

    let cancelled = false

    const loadVideo = async () => {
      setIsConvertingVideo(true)

      const imageLoaderManager = new ImageLoaderManager()
      imageLoaderManagerRef.current = imageLoaderManager

      try {
        let videoSource: Parameters<typeof imageLoaderManager.processVideo>[0]

        if (video.type === 'motion-photo') {
          videoSource = {
            type: 'motion-photo',
            imageUrl: originalUrl,
            offset: video.offset,
            size: video.size,
            presentationTimestamp: video.presentationTimestamp,
          }
        } else if (video.type === 'live-photo') {
          videoSource = {
            type: 'live-photo',
            videoUrl: video.videoUrl,
          }
        } else {
          videoSource = { type: 'none' }
        }

        if (videoSource.type !== 'none') {
          await imageLoaderManager.processVideo(videoSource, videoEl)
          if (!cancelled) {
            setLivePhotoVideoLoaded(true)
          }
        }
      } catch (videoError) {
        if (!cancelled) {
          console.error('Failed to process video:', videoError)
          setVideoConversionError(videoError)
        }
      } finally {
        if (!cancelled) {
          setIsConvertingVideo(false)
        }
      }
    }

    loadVideo()

    return () => {
      cancelled = true
      if (imageLoaderManagerRef.current) {
        imageLoaderManagerRef.current.cleanup()
        imageLoaderManagerRef.current = null
      }
    }
  }, [video, originalUrl, imageLoaded, livePhotoVideoLoaded])

  // Live Photo/Motion Photo hover handling (desktop only)
  const handleMouseEnter = useCallback(() => {
    if (isMobileDevice || !hasVideo || !livePhotoVideoLoaded || isPlayingLivePhoto || isConvertingVideo) {
      return
    }

    hoverTimerRef.current = setTimeout(() => {
      setIsPlayingLivePhoto(true)
      const video = videoRef.current
      if (video) {
        video.currentTime = 0
        video.play()
      }
    }, 200)
  }, [hasVideo, livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    if (isPlayingLivePhoto) {
      setIsPlayingLivePhoto(false)
      const video = videoRef.current
      if (video) {
        video.pause()
        video.currentTime = 0
      }
    }
  }, [isPlayingLivePhoto])

  const handleVideoEnded = useCallback(() => {
    setIsPlayingLivePhoto(false)
  }, [])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }
  }, [])

  return {
    videoRef,
    hasVideo,
    isPlayingLivePhoto,
    isConvertingVideo,
    videoConversionError,
    handleMouseEnter,
    handleMouseLeave,
    handleVideoEnded,
  }
}
