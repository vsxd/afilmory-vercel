import { clsxm } from "@afilmory/ui";
import { m, useAnimationControls, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useStableVideoSource } from "~/hooks/useStableVideoSource";
import type { VideoSource } from "~/lib/image-loading-types";
import { useAfilmoryRuntime } from "~/runtime/app-runtime";

import type { LoadingIndicatorRef } from "./LoadingIndicator";
import type { LivePhotoVideoHandle } from "./types";

export type { LivePhotoVideoHandle } from "./types";

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

interface LivePhotoVideoProps {
  /** Video source (Live Photo or Motion Photo) */
  videoSource: VideoSource;
  /** 加载指示器引用 */
  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>;
  /** 是否是当前图片 */
  isCurrentImage: boolean;
  /** 自定义样式类名 */
  className?: string;
  onPlayingChange?: (isPlaying: boolean) => void;
  /** 是否自动播放一次 */
  shouldAutoPlayOnce?: boolean;
}

export const LivePhotoVideo = ({
  ref,
  videoSource,
  loadingIndicatorRef,
  isCurrentImage,
  className,
  onPlayingChange,
  shouldAutoPlayOnce = false,
}: LivePhotoVideoProps & {
  ref?: React.RefObject<LivePhotoVideoHandle | null>;
}) => {
  const runtime = useAfilmoryRuntime();
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false);
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false);
  const [isConvertingVideo, setIsConvertingVideo] = useState(false);
  const shouldReduceMotion = useReducedMotion() === true;
  const hasAutoPlayedRef = useRef(false);
  const isConvertingVideoRef = useRef(false);
  const loadedVideoSourceKeyRef = useRef<string | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoAnimateController = useAnimationControls();
  const { videoSource: stableVideoSource, videoSourceKey } =
    useStableVideoSource(videoSource);

  useEffect(() => {
    onPlayingChange?.(isPlayingLivePhoto);
  }, [isPlayingLivePhoto, onPlayingChange]);

  useEffect(() => {
    isConvertingVideoRef.current = isConvertingVideo;
  }, [isConvertingVideo]);

  const clearPlayTimer = useCallback(() => {
    if (!playTimerRef.current) {
      return;
    }

    clearTimeout(playTimerRef.current);
    playTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!isCurrentImage || isConvertingVideoRef.current || !videoRef.current) {
      return;
    }
    if (
      stableVideoSource.type === "none" ||
      loadedVideoSourceKeyRef.current === videoSourceKey
    ) {
      return;
    }

    const imageLoaderManager = runtime.imageLoading.createLoader();
    let cancelled = false;
    const currentVideoElement = videoRef.current;
    loadedVideoSourceKeyRef.current = null;
    hasAutoPlayedRef.current = false;
    isConvertingVideoRef.current = true;
    setLivePhotoVideoLoaded(false);
    setIsConvertingVideo(true);

    const processVideo = async () => {
      try {
        await imageLoaderManager.processVideo(
          stableVideoSource,
          currentVideoElement,
          {
            onLoadingStateUpdate: (state) => {
              if (!cancelled)
                loadingIndicatorRef.current?.updateLoadingState(state);
            },
          },
        );

        if (!cancelled) {
          loadedVideoSourceKeyRef.current = videoSourceKey;
          setLivePhotoVideoLoaded(true);
        }
      } catch (videoError) {
        if (!cancelled && !isAbortLikeError(videoError)) {
          console.error("Failed to process video:", videoError);
        }
      } finally {
        if (!cancelled) {
          isConvertingVideoRef.current = false;
          setIsConvertingVideo(false);
        }
      }
    };

    void processVideo();

    return () => {
      cancelled = true;
      isConvertingVideoRef.current = false;
      runtime.imageLoading.cleanupLoader(imageLoaderManager);
    };
  }, [
    isCurrentImage,
    videoSourceKey,
    stableVideoSource,
    runtime.imageLoading,
    loadingIndicatorRef,
  ]);

  useEffect(() => {
    if (!isCurrentImage) {
      clearPlayTimer();
      setIsPlayingLivePhoto(false);
      setLivePhotoVideoLoaded(false);
      isConvertingVideoRef.current = false;
      loadedVideoSourceKeyRef.current = null;
      setIsConvertingVideo(false);
      hasAutoPlayedRef.current = false;

      videoAnimateController.set({ opacity: 0 });
      resetVideoElement(videoRef.current);
    }
  }, [isCurrentImage, videoAnimateController, clearPlayTimer]);

  useEffect(() => {
    const currentVideoElement = videoRef.current;

    return () => {
      clearPlayTimer();
      loadedVideoSourceKeyRef.current = null;
      resetVideoElement(currentVideoElement);
    };
  }, [clearPlayTimer]);

  const play = useCallback(async () => {
    if (!livePhotoVideoLoaded || isPlayingLivePhoto || isConvertingVideo)
      return;
    setIsPlayingLivePhoto(true);

    clearPlayTimer();
    playTimerRef.current = setTimeout(async () => {
      playTimerRef.current = null;
      await videoAnimateController.start({
        opacity: 1,
        transition: {
          duration: shouldReduceMotion ? 0 : 0.15,
          ease: "easeOut",
        },
      });
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        void video.play().catch((error: unknown) => {
          console.error("Failed to play live photo video:", error);
          setIsPlayingLivePhoto(false);
          // 透明度由 animate 控制器单独持有：play() 被拒时控制器仍停在 1，
          // 不归零会留下一帧冻结的视频盖住底图。
          videoAnimateController.set({ opacity: 0 });
        });
      }
    }, 0);
  }, [
    livePhotoVideoLoaded,
    isPlayingLivePhoto,
    isConvertingVideo,
    videoAnimateController,
    clearPlayTimer,
    shouldReduceMotion,
  ]);

  const stop = useCallback(async () => {
    if (!isPlayingLivePhoto) return;

    clearPlayTimer();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    await videoAnimateController.start({
      opacity: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.2,
        ease: "easeIn",
      },
    });
    setIsPlayingLivePhoto(false);
  }, [
    isPlayingLivePhoto,
    videoAnimateController,
    clearPlayTimer,
    shouldReduceMotion,
  ]);

  // Auto-play effect - play once when video is loaded
  useEffect(() => {
    if (
      shouldAutoPlayOnce &&
      !shouldReduceMotion &&
      isCurrentImage &&
      livePhotoVideoLoaded &&
      !isPlayingLivePhoto &&
      !isConvertingVideo &&
      !hasAutoPlayedRef.current
    ) {
      hasAutoPlayedRef.current = true;
      play();
    }
  }, [
    shouldAutoPlayOnce,
    isCurrentImage,
    livePhotoVideoLoaded,
    isPlayingLivePhoto,
    isConvertingVideo,
    play,
    shouldReduceMotion,
  ]);

  useImperativeHandle(ref, () => ({
    play,
    stop,
    getIsVideoLoaded: () => livePhotoVideoLoaded,
  }));

  const handleVideoEnded = useCallback(() => {
    stop();
  }, [stop]);

  return (
    <m.video
      ref={videoRef}
      className={clsxm(
        "pointer-events-none absolute inset-0 z-10 h-full w-full object-contain",
        className,
      )}
      muted
      playsInline
      onEnded={handleVideoEnded}
      initial={{ opacity: 0 }}
      animate={videoAnimateController}
    />
  );
};

LivePhotoVideo.displayName = "LivePhotoVideo";
