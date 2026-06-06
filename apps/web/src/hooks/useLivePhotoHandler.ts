import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isMobileDevice } from "~/lib/device-viewport";
import type { ImageLoaderManager } from "~/lib/image-loader-manager";
import { useAfilmoryRuntime } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

interface UseLivePhotoHandlerProps {
  data: PhotoManifest;
  imageLoaded: boolean;
}

type LoadableVideo =
  | {
      type: "motion-photo";
      offset: number;
      size?: number;
      presentationTimestamp?: number;
    }
  | { type: "live-photo"; videoUrl: string }
  | undefined;

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function resetVideoElement(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) {
    return;
  }

  videoElement.pause();
  videoElement.removeAttribute("src");
  videoElement.load();
}

function getVideoLoadKey(
  dataVideo: LoadableVideo,
  originalUrl: string,
): string {
  if (!dataVideo) {
    return "none";
  }

  if (dataVideo.type === "motion-photo") {
    return [
      "motion-photo",
      originalUrl,
      dataVideo.offset,
      dataVideo.size ?? "",
      dataVideo.presentationTimestamp ?? "",
    ].join(":");
  }

  if (dataVideo.type === "live-photo") {
    return `live-photo:${dataVideo.videoUrl}`;
  }

  return "none";
}

export const useLivePhotoHandler = ({
  data,
  imageLoaded,
}: UseLivePhotoHandlerProps) => {
  const { id, video, originalUrl } = data;
  const runtime = useAfilmoryRuntime();
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false);
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false);
  const [isConvertingVideo, setIsConvertingVideo] = useState(false);
  const [videoConversionError, setVideoConversionError] =
    useState<unknown>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null);
  const loadedVideoKeyRef = useRef<string | null>(null);
  const videoType = video?.type;
  const livePhotoUrl = videoType === "live-photo" ? video?.videoUrl : undefined;
  const motionPhotoOffset =
    videoType === "motion-photo" ? video?.offset : undefined;
  const motionPhotoSize =
    videoType === "motion-photo" ? video?.size : undefined;
  const motionPhotoPresentationTimestamp =
    videoType === "motion-photo" ? video?.presentationTimestamp : undefined;
  const stableVideo = useMemo(() => {
    if (!videoType) {
      return;
    }

    if (videoType === "motion-photo") {
      return {
        type: "motion-photo" as const,
        offset: motionPhotoOffset!,
        size: motionPhotoSize,
        presentationTimestamp: motionPhotoPresentationTimestamp,
      };
    }

    if (videoType === "live-photo") {
      return {
        type: "live-photo" as const,
        videoUrl: livePhotoUrl!,
      };
    }
  }, [
    videoType,
    livePhotoUrl,
    motionPhotoOffset,
    motionPhotoSize,
    motionPhotoPresentationTimestamp,
  ]);
  const videoLoadKey = getVideoLoadKey(stableVideo, originalUrl);

  const hasVideo = videoType !== undefined;

  useEffect(() => {
    setIsPlayingLivePhoto(false);
    setLivePhotoVideoLoaded(false);
    setIsConvertingVideo(false);
    setVideoConversionError(null);
    loadedVideoKeyRef.current = null;

    resetVideoElement(videoRef.current);
  }, [id]);

  // Live Photo/Motion Photo video loading logic
  useEffect(() => {
    if (
      !stableVideo ||
      !imageLoaded ||
      !videoRef.current ||
      loadedVideoKeyRef.current === videoLoadKey
    ) {
      return;
    }

    const videoEl = videoRef.current;

    let cancelled = false;

    const loadVideo = async () => {
      setLivePhotoVideoLoaded(false);
      setIsConvertingVideo(true);

      const imageLoaderManager = runtime.imageLoading.createLoader();
      imageLoaderManagerRef.current = imageLoaderManager;

      try {
        let videoSource: Parameters<typeof imageLoaderManager.processVideo>[0];

        if (stableVideo.type === "motion-photo") {
          videoSource = {
            type: "motion-photo",
            imageUrl: originalUrl,
            offset: stableVideo.offset,
            size: stableVideo.size,
            presentationTimestamp: stableVideo.presentationTimestamp,
          };
        } else if (stableVideo.type === "live-photo") {
          videoSource = {
            type: "live-photo",
            videoUrl: stableVideo.videoUrl,
          };
        } else {
          videoSource = { type: "none" };
        }

        if (videoSource.type !== "none") {
          await imageLoaderManager.processVideo(videoSource, videoEl);
          if (!cancelled) {
            loadedVideoKeyRef.current = videoLoadKey;
            setLivePhotoVideoLoaded(true);
          }
        }
      } catch (videoError) {
        if (!cancelled && !isAbortLikeError(videoError)) {
          console.error("Failed to process video:", videoError);
          setVideoConversionError(videoError);
        }
      } finally {
        if (!cancelled) {
          setIsConvertingVideo(false);
        }
      }
    };

    void loadVideo();

    return () => {
      cancelled = true;
      if (imageLoaderManagerRef.current) {
        runtime.imageLoading.cleanupLoader(imageLoaderManagerRef.current);
        imageLoaderManagerRef.current = null;
      }
      resetVideoElement(videoEl);
    };
  }, [
    stableVideo,
    originalUrl,
    imageLoaded,
    videoLoadKey,
    runtime.imageLoading,
  ]);

  // Live Photo/Motion Photo hover handling (desktop only)
  const handleMouseEnter = useCallback(() => {
    if (
      isMobileDevice ||
      !hasVideo ||
      !livePhotoVideoLoaded ||
      isPlayingLivePhoto ||
      isConvertingVideo
    ) {
      return;
    }

    hoverTimerRef.current = setTimeout(() => {
      setIsPlayingLivePhoto(true);
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        void video.play().catch((error: unknown) => {
          console.error("Failed to play masonry live photo video:", error);
          setIsPlayingLivePhoto(false);
        });
      }
    }, 200);
  }, [hasVideo, livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    if (isPlayingLivePhoto) {
      setIsPlayingLivePhoto(false);
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, [isPlayingLivePhoto]);

  const handleVideoEnded = useCallback(() => {
    setIsPlayingLivePhoto(false);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    const currentVideoElement = videoRef.current;

    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }

      if (imageLoaderManagerRef.current) {
        runtime.imageLoading.cleanupLoader(imageLoaderManagerRef.current);
        imageLoaderManagerRef.current = null;
      }

      loadedVideoKeyRef.current = null;
      resetVideoElement(currentVideoElement);
    };
  }, [runtime.imageLoading]);

  return {
    videoRef,
    hasVideo,
    isPlayingLivePhoto,
    isConvertingVideo,
    videoConversionError,
    handleMouseEnter,
    handleMouseLeave,
    handleVideoEnded,
  };
};
