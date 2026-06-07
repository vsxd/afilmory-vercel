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
      {thumbHash && !isLoaded && !hasError && (
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
            "h-full w-full object-cover transition-opacity duration-300",
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
