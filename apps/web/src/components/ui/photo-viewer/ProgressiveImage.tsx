import { clsxm, Thumbhash } from "@afilmory/ui";
import { WebGLImageViewer } from "@afilmory/webgl-viewer";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useMediaQuery } from "usehooks-ts";

import { useShowContextMenu } from "~/atoms/context-menu";
import { canUseWebGL } from "~/lib/feature";
import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
} from "~/lib/thumbnail-load-cache";

import { SlidingNumber } from "../number/SlidingNumber";
import { PHOTO_VIEWER_FIT_SCALE } from "./animations/utils";
import { DOMImageViewer } from "./DOMImageViewer";
import { HDRBadge } from "./HDRBadge";
import {
  createContextMenuItems,
  useImageLoader,
  useLivePhotoControls,
  useProgressiveImageState,
  useScaleIndicator,
  useWebGLLoadingState,
} from "./hooks";
import { LivePhotoBadge } from "./LivePhotoBadge";
import { LivePhotoVideo } from "./LivePhotoVideo";
import type { ProgressiveImageProps, WebGLImageViewerRef } from "./types";

const PHOTO_VIEWER_FIT_IMAGE_STYLE = {
  top: "50%",
  left: "50%",
  width: `${PHOTO_VIEWER_FIT_SCALE * 100}%`,
  height: `${PHOTO_VIEWER_FIT_SCALE * 100}%`,
  transform: "translate(-50%, -50%)",
};
const WEBGL_DEBUG_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_AFILMORY_WEBGL_DEBUG === "true";

export const ProgressiveImage = ({
  photoId,
  src,
  thumbnailSrc,
  thumbHash,
  alt,
  width,
  height,
  className,
  onError,
  onProgress,
  onZoomChange,
  onBlobSrcChange,
  maxZoom = 20,
  minZoom = 1,
  isCurrentImage = false,
  shouldRenderHighRes = true,
  videoSource,
  shouldAutoPlayVideoOnce = false,
  isHDR = false,
  loadingIndicatorRef,
}: ProgressiveImageProps) => {
  const { t } = useTranslation();

  // State management
  const [state, setState] = useProgressiveImageState();
  const [useDomFallback, setUseDomFallback] = useState(false);
  const {
    blobSrc,
    imageBlob,
    highResLoaded,
    error,
    isHighResImageRendered,
    currentScale,
    showScaleIndicator,
    isThumbnailLoaded,
    isLivePhotoPlaying,
  } = state;

  const isActiveImage = Boolean(isCurrentImage && shouldRenderHighRes);
  const webGLMinZoom = Math.min(minZoom, PHOTO_VIEWER_FIT_SCALE);
  const shouldShowLowResPlaceholder = Boolean(
    (thumbnailSrc || thumbHash) &&
      !isThumbnailLoaded &&
      !isHighResImageRendered &&
      !error,
  );

  // 判断是否有视频内容（Live Photo 或 Motion Photo）
  const hasVideo = Boolean(videoSource && videoSource.type !== "none");

  // Refs
  const thumbnailRef = useRef<HTMLImageElement>(null);
  const webglImageViewerRef = useRef<WebGLImageViewerRef | null>(null);
  const domImageViewerRef = useRef<ReactZoomPanPinchRef>(null);
  const livePhotoRef = useRef<any>(null);
  const fallbackSourceRef = useRef(src);
  const useDomFallbackRef = useRef(useDomFallback);
  useDomFallbackRef.current = useDomFallback;
  const thumbnailCacheKey =
    photoId && thumbnailSrc
      ? getThumbnailLoadCacheKey(photoId, thumbnailSrc)
      : null;

  // Hooks
  const imageLoaderManagerRef = useImageLoader(
    src,
    isCurrentImage,
    highResLoaded,
    error,
    onProgress,
    onError,
    onBlobSrcChange,
    loadingIndicatorRef,
    setState.setBlobSrc,
    setState.setImageBlob,
    setState.setHighResLoaded,
    setState.setError,
    setState.setIsHighResImageRendered,
  );

  const { onTransformed, onDOMTransformed } = useScaleIndicator(
    onZoomChange,
    setState.setCurrentScale,
    setState.setShowScaleIndicator,
  );

  const { handleLongPressStart, handleLongPressEnd } = useLivePhotoControls(
    hasVideo,
    isLivePhotoPlaying,
    livePhotoRef,
  );

  const handleWebGLLoadingStateChange =
    useWebGLLoadingState(loadingIndicatorRef);

  const handleThumbnailLoad = useCallback(() => {
    if (thumbnailCacheKey) {
      markThumbnailLoaded(thumbnailCacheKey);
    }
    setState.setIsThumbnailLoaded(true);
  }, [setState, thumbnailCacheKey]);

  useEffect(() => {
    if (!thumbnailSrc) {
      setState.setIsThumbnailLoaded(false);
      return;
    }

    if (thumbnailCacheKey && hasLoadedThumbnail(thumbnailCacheKey)) {
      setState.setIsThumbnailLoaded(true);
      return;
    }

    const thumbnailElement = thumbnailRef.current;
    const isThumbnailReady = Boolean(
      thumbnailElement?.complete && thumbnailElement.naturalWidth > 0,
    );

    if (isThumbnailReady && thumbnailCacheKey) {
      markThumbnailLoaded(thumbnailCacheKey);
    }

    setState.setIsThumbnailLoaded(isThumbnailReady);
  }, [thumbnailCacheKey, thumbnailSrc, setState]);

  // 高清图已渲染到DOM（WebGL onImagePainted 或 DOM img onLoad）
  const handleHighResRendered = useCallback(() => {
    setState.setIsHighResImageRendered(true);
    loadingIndicatorRef.current?.updateLoadingState({
      isVisible: false,
    });
  }, [loadingIndicatorRef, setState]);

  const showContextMenu = useShowContextMenu();

  const isHDRSupported = useMediaQuery("(dynamic-range: high)");
  // Only use HDR if the browser supports it and the image is HDR
  const shouldUseHDR = isHDR && isHDRSupported;

  useEffect(() => {
    if (fallbackSourceRef.current === src) return;

    fallbackSourceRef.current = src;
    if (!useDomFallbackRef.current) return;

    setUseDomFallback(false);
  }, [src]);

  const handleWebGLError = useCallback(() => {
    setUseDomFallback(true);
    loadingIndicatorRef.current?.updateLoadingState({
      isVisible: false,
      isWebGLLoading: false,
    });
  }, [loadingIndicatorRef]);

  const shouldUseDomImageViewer =
    hasVideo || shouldUseHDR || !canUseWebGL || useDomFallback;

  return (
    <div
      className={clsxm("relative overflow-hidden", className)}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchMove={handleLongPressEnd}
      onTouchEnd={handleLongPressEnd}
    >
      {shouldShowLowResPlaceholder && (
        <div
          className="bg-fill-quaternary pointer-events-none absolute overflow-hidden rounded-lg"
          style={PHOTO_VIEWER_FIT_IMAGE_STYLE}
        >
          {thumbHash ? (
            <Thumbhash
              thumbHash={thumbHash}
              className="size-full object-contain opacity-80 blur-sm"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <i className="i-mingcute-loading-line text-text-tertiary animate-spin text-2xl" />
            </div>
          )}
        </div>
      )}

      {/* 缩略图 - 在高分辨率图片未加载或加载失败时显示 */}
      {thumbnailSrc && (!isHighResImageRendered || error) && (
        <img
          ref={thumbnailRef}
          src={thumbnailSrc}
          key={thumbnailSrc}
          alt={alt}
          className={clsxm(
            "pointer-events-none absolute object-contain transition-opacity duration-300",
            isThumbnailLoaded ? "opacity-100" : "opacity-0",
          )}
          style={PHOTO_VIEWER_FIT_IMAGE_STYLE}
          loading="eager"
          decoding="async"
          fetchPriority={isCurrentImage ? "high" : "auto"}
          onLoad={handleThumbnailLoad}
        />
      )}

      {/* 高分辨率图片 - 只在成功加载且非错误状态时显示 */}
      {highResLoaded && blobSrc && isActiveImage && !error && (
        <div
          className="absolute inset-0 h-full w-full"
          onContextMenu={(e) => {
            const items = createContextMenuItems(blobSrc, alt, t);
            showContextMenu(items, e);
          }}
        >
          {/* LivePhoto/Motion Photo、HDR 或无 WebGL 时使用 DOMImageViewer */}
          {shouldUseDomImageViewer ? (
            <DOMImageViewer
              ref={domImageViewerRef}
              onZoomChange={onDOMTransformed}
              minZoom={minZoom}
              maxZoom={maxZoom}
              fitScale={PHOTO_VIEWER_FIT_SCALE}
              src={blobSrc}
              alt={alt}
              highResLoaded={highResLoaded}
              onLoad={handleHighResRendered}
            >
              {/* LivePhoto/Motion Photo 视频组件作为 children，跟随图片的变换 */}
              {hasVideo && videoSource && imageLoaderManagerRef.current && (
                <LivePhotoVideo
                  ref={livePhotoRef}
                  videoSource={videoSource}
                  imageLoaderManager={imageLoaderManagerRef.current}
                  loadingIndicatorRef={loadingIndicatorRef}
                  isCurrentImage={isCurrentImage}
                  onPlayingChange={setState.setIsLivePhotoPlaying}
                  shouldAutoPlayOnce={shouldAutoPlayVideoOnce}
                />
              )}
            </DOMImageViewer>
          ) : (
            <WebGLImageViewer
              ref={webglImageViewerRef}
              src={blobSrc}
              sourceBlob={imageBlob}
              className="absolute inset-0 h-full w-full"
              width={width}
              height={height}
              initialScale={PHOTO_VIEWER_FIT_SCALE}
              minScale={webGLMinZoom}
              maxScale={maxZoom}
              limitToBounds={true}
              centerOnInit={true}
              smooth={true}
              onZoomChange={onTransformed}
              onLoadingStateChange={handleWebGLLoadingStateChange}
              onImagePainted={handleHighResRendered}
              onError={handleWebGLError}
              debug={WEBGL_DEBUG_ENABLED}
            />
          )}
        </div>
      )}

      {hasVideo && highResLoaded && blobSrc && isActiveImage && !error && (
        <LivePhotoBadge
          livePhotoRef={livePhotoRef}
          isLivePhotoPlaying={isLivePhotoPlaying}
          imageLoaderManagerRef={imageLoaderManagerRef}
        />
      )}

      {shouldUseHDR && highResLoaded && blobSrc && isActiveImage && !error && (
        <HDRBadge />
      )}

      {/* 备用图片（当 WebGL 不可用时） - 只在非错误状态时显示 */}
      {!canUseWebGL &&
        !hasVideo &&
        !shouldUseHDR &&
        highResLoaded &&
        blobSrc &&
        isActiveImage &&
        !error && (
          <div className="pointer-events-none absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded bg-black/50 px-3 py-1.5 text-white">
            <i className="i-mingcute-warning-line text-base" />
            <span className="text-xs">{t("photo.webgl.unavailable")}</span>
          </div>
        )}

      {/* 操作提示 */}
      {!hasVideo && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          {t("photo.zoom.hint")}
        </div>
      )}

      {/* 缩放倍率提示 */}
      <AnimatePresence>
        {showScaleIndicator && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded bg-black/50 px-3 py-1 text-lg text-white tabular-nums"
          >
            <SlidingNumber number={currentScale} decimalPlaces={1} />x
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export type { ProgressiveImageProps } from "./types";
