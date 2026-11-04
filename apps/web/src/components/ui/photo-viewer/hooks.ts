import { LoadingState } from "@afilmory/webgl-viewer";
import type { TFunction } from "i18next";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MenuItemSeparator, MenuItemText } from "~/atoms/context-menu";
import { isMobileDevice } from "~/lib/device-viewport";
import type { MediaLease } from "~/lib/media-resource";
import { getMediaTaskDiagnostic, MediaTaskError } from "~/lib/media-task";
import { useAfilmoryRuntime } from "~/runtime/app-runtime";

import type { LoadingIndicatorRef } from "./LoadingIndicator";
import {
  presentMediaTaskError,
  presentMediaTaskEvent,
} from "./media-loading-presentation";
import type {
  ImageContentState,
  LivePhotoVideoHandle,
  ProgressiveImageState,
} from "./types";
import { SHOW_SCALE_INDICATOR_DURATION } from "./types";

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useProgressiveImageState(initialThumbnailLoaded = false) {
  const [image, setImage] = useState<ImageContentState>({ status: "empty" });
  const [currentScale, setCurrentScale] = useState(1);
  const [showScaleIndicator, setShowScaleIndicator] = useState(false);
  const [isThumbnailLoaded, setIsThumbnailLoaded] = useState(
    initialThumbnailLoaded,
  );
  const [isLivePhotoPlaying, setIsLivePhotoPlaying] = useState(false);
  const actions = useMemo(
    () => ({
      resetImage: () =>
        setImage((previous) =>
          previous.status === "empty" ? previous : { status: "empty" },
        ),
      setImageLease: (lease: MediaLease, sourceUrl?: string) =>
        setImage({ status: "loaded", lease, sourceUrl, rendered: false }),
      setImageError: (error: Error) => setImage({ status: "failed", error }),
      markImageRendered: () =>
        setImage((previous) =>
          previous.status === "loaded"
            ? { ...previous, rendered: true }
            : previous,
        ),
      resetImageRendered: () =>
        setImage((previous) =>
          previous.status === "loaded" && previous.rendered
            ? { ...previous, rendered: false }
            : previous,
        ),
      setCurrentScale,
      setShowScaleIndicator,
      setIsThumbnailLoaded,
      setIsLivePhotoPlaying,
    }),
    [],
  );
  const state: ProgressiveImageState = {
    image,
    currentScale,
    showScaleIndicator,
    isThumbnailLoaded,
    isLivePhotoPlaying,
  };
  return [state, actions] as const;
}

interface ImageLoaderOptions {
  src: string;
  fallbackSrc?: string;
  isCurrentImage: boolean;
  image: ImageContentState;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  onBlobSrcChange?: (blobSrc: string | null) => void;
  loadingIndicatorRef?: React.RefObject<LoadingIndicatorRef | null>;
  actions: Pick<
    ReturnType<typeof useProgressiveImageState>[1],
    "resetImage" | "setImageLease" | "setImageError"
  >;
}

export function useImageLoader({
  src,
  fallbackSrc,
  isCurrentImage,
  image,
  onProgress,
  onError,
  onBlobSrcChange,
  loadingIndicatorRef,
  actions,
}: ImageLoaderOptions) {
  const { t } = useTranslation();
  const runtime = useAfilmoryRuntime();
  const [fallbackFor, setFallbackFor] = useState<string | null>(null);
  const effectiveSrc = fallbackFor === src && fallbackSrc ? fallbackSrc : src;
  const imageLeaseRef = useRef<MediaLease | null>(null);
  const reportedFailureRef = useRef(false);
  const { resetImage, setImageLease, setImageError } = actions;
  const { status } = image;
  const blobSrc = image.status === "loaded" ? image.lease.blobSrc : null;

  useLayoutEffect(() => {
    if (isCurrentImage) loadingIndicatorRef?.current?.resetLoadingState();
  }, [src, isCurrentImage, loadingIndicatorRef]);

  useEffect(() => {
    // A virtual slide can keep its Blob lease while its canvas is unmounted.
    // Returning to it must publish that source again, even without a new load.
    if (isCurrentImage) onBlobSrcChange?.(blobSrc);
  }, [blobSrc, isCurrentImage, onBlobSrcChange]);

  useEffect(() => {
    resetImage();
    reportedFailureRef.current = false;
    return () => {
      imageLeaseRef.current?.release();
      imageLeaseRef.current = null;
    };
  }, [effectiveSrc, runtime, resetImage]);

  const reportFailure = useCallback(
    (failure: Error) => {
      if (reportedFailureRef.current) return;
      if (fallbackSrc && effectiveSrc !== fallbackSrc) {
        runtime.imageCache.delete(src);
        resetImage();
        setFallbackFor(src);
        return;
      }
      reportedFailureRef.current = true;
      imageLeaseRef.current?.release();
      imageLeaseRef.current = null;
      setImageError(failure);
      console.error("Failed to load image:", getMediaTaskDiagnostic(failure));
      onError?.(failure);
    },
    [
      effectiveSrc,
      fallbackSrc,
      runtime.imageCache,
      src,
      resetImage,
      setImageError,
      onError,
    ],
  );

  const retry = useCallback(() => {
    reportedFailureRef.current = false;
    // A response can pass format detection but fail decoding. Fetch fresh
    // bytes on an explicit retry instead of replaying the cached bad image.
    runtime.imageCache.delete(effectiveSrc);
    loadingIndicatorRef?.current?.resetLoadingState();
    resetImage();
  }, [runtime.imageCache, effectiveSrc, loadingIndicatorRef, resetImage]);

  useEffect(() => {
    if (image.status !== "failed" || !isCurrentImage) return;
    const indicator = loadingIndicatorRef?.current;
    indicator?.updateLoadingState({
      ...presentMediaTaskError(image.error, t),
      onRetry:
        image.error instanceof MediaTaskError &&
        image.error.code === "resource-limit"
          ? undefined
          : retry,
    });
    return () => indicator?.resetLoadingState();
  }, [image, isCurrentImage, loadingIndicatorRef, retry, t]);

  useEffect(() => {
    if (status !== "empty" || !isCurrentImage) return;
    const loader = runtime.imageLoading.createLoader();
    let cancelled = false;
    loadingIndicatorRef?.current?.resetLoadingState();
    const load = async () => {
      try {
        const result = await loader.loadImage(effectiveSrc, {
          priority: "high",
          onProgress: (progress) => {
            if (!cancelled) onProgress?.(progress);
          },
          onEvent: (event) => {
            if (!cancelled)
              loadingIndicatorRef?.current?.updateLoadingState(
                presentMediaTaskEvent(event, t),
              );
          },
        });
        if (cancelled) {
          result.release();
          return;
        }
        imageLeaseRef.current?.release();
        imageLeaseRef.current = result;
        setImageLease(result, effectiveSrc);
      } catch (cause) {
        if (cancelled || isAbortLikeError(cause)) return;
        reportFailure(
          cause instanceof Error
            ? cause
            : new Error("Image load failed", { cause }),
        );
      }
    };
    void load();
    return () => {
      cancelled = true;
      runtime.imageLoading.cleanupLoader(loader);
    };
  }, [
    status,
    isCurrentImage,
    runtime.imageLoading,
    effectiveSrc,
    loadingIndicatorRef,
    onProgress,
    t,
    setImageLease,
    reportFailure,
  ]);
  return reportFailure;
}

export const useScaleIndicator = (
  onZoomChange?: (isZoomed: boolean) => void,
  setCurrentScale?: (scale: number) => void,
  setShowScaleIndicator?: (show: boolean) => void,
) => {
  const scaleIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const displayedScaleRef = useRef<number | null>(null);
  const zoomedRef = useRef<boolean | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    return () => {
      if (scaleIndicatorTimeoutRef.current) {
        clearTimeout(scaleIndicatorTimeoutRef.current);
      }
    };
  }, []);

  const handleScaleChange = useCallback(
    (scale: number, isZoomed: boolean) => {
      const displayedScale = Math.round(scale * 10) / 10;
      if (displayedScaleRef.current !== displayedScale || !visibleRef.current) {
        displayedScaleRef.current = displayedScale;
        visibleRef.current = true;
        startTransition(() => {
          setCurrentScale?.(displayedScale);
          setShowScaleIndicator?.(true);
        });
      }

      // 清除之前的定时器
      if (scaleIndicatorTimeoutRef.current) {
        clearTimeout(scaleIndicatorTimeoutRef.current);
      }

      scaleIndicatorTimeoutRef.current = setTimeout(() => {
        visibleRef.current = false;
        setShowScaleIndicator?.(false);
      }, SHOW_SCALE_INDICATOR_DURATION);

      if (zoomedRef.current !== isZoomed) {
        zoomedRef.current = isZoomed;
        onZoomChange?.(isZoomed);
      }
    },
    [onZoomChange, setCurrentScale, setShowScaleIndicator],
  );

  // WebGL Image Viewer 的缩放变化处理
  const onTransformed = useCallback(
    (originalScale: number, relativeScale: number) => {
      // 2% 容差：isZoomed 会关掉下滑关闭手势与 Swiper 横滑，误判为“已缩放”的
      // 代价远大于漏判。引擎侧已有捏合松手回吸（≤10% 残留动画回贴合）与越界
      // 钳制兜底，这里的容差只为动画落点的浮点余量。
      const isZoomed = Math.abs(relativeScale - 1) > 0.02;
      handleScaleChange(originalScale, isZoomed);
    },
    [handleScaleChange],
  );

  // DOM Image Viewer 的缩放变化处理
  const onDOMTransformed = useCallback(
    (isZoomed: boolean, scale: number) => {
      handleScaleChange(scale, isZoomed);
    },
    [handleScaleChange],
  );

  return { onTransformed, onDOMTransformed };
};

export const useLivePhotoControls = (
  isLivePhoto: boolean,
  isLivePhotoPlaying: boolean,
  livePhotoRef: React.RefObject<LivePhotoVideoHandle | null>,
) => {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLongPressStart = useCallback(() => {
    if (!isMobileDevice) return;
    const playVideo = () => livePhotoRef.current?.play();
    if (
      !isLivePhoto ||
      !livePhotoRef.current?.getIsVideoLoaded() ||
      isLivePhotoPlaying
    ) {
      return;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(playVideo, 200);
  }, [isLivePhoto, isLivePhotoPlaying, livePhotoRef]);

  const handleLongPressEnd = useCallback(() => {
    if (!isMobileDevice) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    if (isLivePhotoPlaying) {
      livePhotoRef.current?.stop();
    }
  }, [isLivePhotoPlaying, livePhotoRef]);

  return { handleLongPressStart, handleLongPressEnd };
};

export const useWebGLLoadingState = (
  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>,
) => {
  const { t } = useTranslation();

  const handleWebGLLoadingStateChange = useCallback(
    (
      isLoading: boolean,
      state?: LoadingState,
      quality?: "high" | "medium" | "low" | "unknown",
    ) => {
      let message = "";

      if (state === LoadingState.CREATE_TEXTURE) {
        message = t("photo.webgl.creatingTexture");
      } else if (state === LoadingState.IMAGE_LOADING) {
        message = t("photo.webgl.loadingImage");
      }

      loadingIndicatorRef.current?.updateLoadingState({
        isVisible: isLoading,
        isWebGLLoading: isLoading,
        webglMessage: message,
        webglQuality: quality,
      });
    },
    [t, loadingIndicatorRef],
  );

  return handleWebGLLoadingStateChange;
};

export const createContextMenuItems = (
  blobSrc: string,
  alt: string,
  t: TFunction<"app", undefined>,
  loadCopySource?: () => Promise<MediaLease>,
) => [
  new MenuItemText({
    label: t("photo.copy.image"),
    click: async () => {
      const loadingToast = toast.loading(t("photo.copying"));
      let copyLease: MediaLease | undefined;
      let copySrc = blobSrc;

      try {
        copyLease = await loadCopySource?.();
        copySrc = copyLease?.blobSrc ?? blobSrc;
        // Create a canvas to convert the image to PNG
        const img = new Image();
        img.crossOrigin = "anonymous";

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = copySrc;
        });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx?.drawImage(img, 0, 0);

        // Convert to PNG blob
        await new Promise<void>((resolve, reject) => {
          canvas.toBlob(async (pngBlob) => {
            try {
              if (pngBlob) {
                await navigator.clipboard.write([
                  new ClipboardItem({
                    "image/png": pngBlob,
                  }),
                ]);
                resolve();
              } else {
                reject(new Error("Failed to convert image to PNG"));
              }
            } catch (error) {
              reject(error);
            }
          }, "image/png");
        });

        toast.dismiss(loadingToast);
        toast.success(t("photo.copy.success"));
      } catch (error) {
        console.error("Failed to copy image:", error);

        // Fallback: try to copy the original blob
        try {
          const blob = await fetch(copySrc).then((res) => res.blob());
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
          toast.dismiss(loadingToast);
          toast.success(t("photo.copy.success"));
        } catch (fallbackError) {
          console.error("Fallback copy also failed:", fallbackError);
          toast.dismiss(loadingToast);
          toast.error(t("photo.copy.error"));
        }
      } finally {
        copyLease?.release();
      }
    },
  }),
  MenuItemSeparator.default,
  new MenuItemText({
    label: t("photo.download"),
    click: async () => {
      let downloadUrl = blobSrc;
      try {
        if (!blobSrc.startsWith("blob:")) {
          const response = await fetch(blobSrc);
          if (!response.ok)
            throw new Error(`Download failed: ${response.status}`);
          downloadUrl = URL.createObjectURL(await response.blob());
        }
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = alt;
        a.click();
      } catch {
        toast.error(t("photo.error.loading"));
      } finally {
        if (downloadUrl !== blobSrc)
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    },
  }),
];
