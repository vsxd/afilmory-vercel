import { Thumbhash } from "@afilmory/ui";
import clsx from "clsx";
import type { CSSProperties, ReactEventHandler, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
} from "~/lib/thumbnail-load-cache";

type ThumbnailLoadPolicy = "immediate" | "in-view";
type FetchPriority = "high" | "low" | "auto";

export interface ThumbnailImageProps {
  ref?: Ref<HTMLImageElement>;
  photoId: string;
  src: string;
  alt: string;
  thumbHash?: string | null;
  containerClassName?: string;
  imageClassName?: string;
  placeholderClassName?: string;
  style?: CSSProperties;
  loadPolicy?: ThumbnailLoadPolicy;
  rootMargin?: string;
  threshold?: number;
  loading?: "eager" | "lazy";
  fetchPriority?: FetchPriority;
  decoding?: "async" | "auto" | "sync";
  draggable?: boolean;
  onLoad?: ReactEventHandler<HTMLImageElement>;
  onError?: ReactEventHandler<HTMLImageElement>;
  onLoadStateChange?: (loaded: boolean) => void;
}

export const ThumbnailImage = ({
  ref: forwardedRef,
  photoId,
  src,
  alt,
  thumbHash,
  containerClassName,
  imageClassName,
  placeholderClassName,
  style,
  loadPolicy = "immediate",
  rootMargin = "50px",
  threshold = 0.1,
  loading,
  fetchPriority,
  decoding = "async",
  draggable,
  onLoad,
  onError,
  onLoadStateChange,
}: ThumbnailImageProps) => {
  const cacheKey = useMemo(
    () => getThumbnailLoadCacheKey(photoId, src),
    [photoId, src],
  );
  const [loadState, setLoadState] = useState(() => ({
    cacheKey,
    hasError: false,
    isLoaded: hasLoadedThumbnail(cacheKey),
  }));
  const isLoaded =
    loadState.cacheKey === cacheKey
      ? loadState.isLoaded
      : hasLoadedThumbnail(cacheKey);
  const hasError = loadState.cacheKey === cacheKey && loadState.hasError;
  const imageRef = useRef<HTMLImageElement>(null);

  const setImageRef = useCallback(
    (element: HTMLImageElement | null) => {
      imageRef.current = element;
      if (typeof forwardedRef === "function") {
        forwardedRef(element);
        return;
      }
      if (forwardedRef) {
        forwardedRef.current = element;
      }
    },
    [forwardedRef],
  );

  const shouldObserve = loadPolicy === "in-view" && !isLoaded;
  const { ref: inViewRef, inView } = useInView({
    rootMargin,
    threshold,
    triggerOnce: true,
    skip: !shouldObserve,
  });
  const shouldLoadImage = loadPolicy === "immediate" || isLoaded || inView;

  const markLoaded = useCallback(
    (nextLoaded: boolean) => {
      if (nextLoaded) {
        markThumbnailLoaded(cacheKey);
      }
      setLoadState({
        cacheKey,
        hasError: false,
        isLoaded: nextLoaded,
      });
      onLoadStateChange?.(nextLoaded);
    },
    [cacheKey, onLoadStateChange],
  );

  useEffect(() => {
    const cached = hasLoadedThumbnail(cacheKey);
    setLoadState({
      cacheKey,
      hasError: false,
      isLoaded: cached,
    });
    onLoadStateChange?.(cached);
  }, [cacheKey, onLoadStateChange]);

  useEffect(() => {
    if (!shouldLoadImage || isLoaded) {
      return;
    }

    const imageElement = imageRef.current;
    if (imageElement?.complete && imageElement.naturalWidth > 0) {
      markLoaded(true);
    }
  }, [isLoaded, markLoaded, shouldLoadImage]);

  const handleLoad = useCallback<ReactEventHandler<HTMLImageElement>>(
    (event) => {
      markLoaded(true);
      onLoad?.(event);
    },
    [markLoaded, onLoad],
  );

  const handleError = useCallback<ReactEventHandler<HTMLImageElement>>(
    (event) => {
      setLoadState({
        cacheKey,
        hasError: true,
        isLoaded: false,
      });
      onLoadStateChange?.(false);
      onError?.(event);
    },
    [cacheKey, onError, onLoadStateChange],
  );

  return (
    <div
      ref={inViewRef}
      className={clsx("relative overflow-hidden", containerClassName)}
      style={style}
    >
      {/* thumbhash 常驻在 img 下层：虚拟列表重挂载时（isLoaded 已为 true）新 img
          仍需异步取缓存 + 解码，若此刻无占位会露出灰底闪一下；让占位一直垫底，
          img 解码完成即以不透明像素覆盖它，空窗期展示的是模糊缩略而非灰块。 */}
      {thumbHash && !hasError && (
        <Thumbhash
          thumbHash={thumbHash}
          className={clsx("absolute inset-0", placeholderClassName)}
        />
      )}

      {shouldLoadImage && !hasError && (
        <img
          ref={setImageRef}
          src={src}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={decoding}
          draggable={draggable}
          className={clsx(
            // relative 必不可少：thumbhash 占位是 absolute 定位且常驻，CSS 绘制顺序里
            // 定位元素画在非定位的普通流元素之上——img 若不定位会被占位永久盖住
            // （hover 的 scale transform 恰好创建 stacking context，表现为“悬停才清晰”）。
            "relative h-full w-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            imageClassName,
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
};
