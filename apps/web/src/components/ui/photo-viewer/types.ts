import type { ImageLoaderManager } from "~/lib/image-loader-manager";
import type { VideoSource } from "~/lib/image-loading-types";

import type { LoadingIndicatorRef } from "./LoadingIndicator";

export type { VideoSource } from "~/lib/image-loading-types";

export interface LivePhotoVideoHandle {
  play: () => void;
  stop: () => void;
  getIsVideoLoaded: () => boolean;
}

export const SHOW_SCALE_INDICATOR_DURATION = 1000;

export interface ProgressiveImageProps {
  photoId?: string;
  src: string;
  thumbnailSrc?: string;
  thumbHash?: string | null;

  alt: string;
  width?: number;
  height?: number;
  className?: string;
  onError?: () => void;
  onProgress?: (progress: number) => void;
  onZoomChange?: (isZoomed: boolean) => void;
  onBlobSrcChange?: (blobSrc: string | null) => void;

  maxZoom?: number;
  minZoom?: number;

  isCurrentImage?: boolean;
  shouldRenderHighRes?: boolean;

  // Video source (Live Photo or Motion Photo)
  videoSource?: VideoSource;
  shouldAutoPlayVideoOnce?: boolean;

  // HDR 相关 props
  isHDR?: boolean;

  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>;
}

export interface WebGLImageViewerRef {
  zoomIn: (animated?: boolean) => void;
  zoomOut: (animated?: boolean) => void;
  resetView: () => void;
  getScale: () => number;
}

export interface DOMImageViewerProps {
  ref?: React.RefObject<
    import("react-zoom-pan-pinch").ReactZoomPanPinchRef | null
  >;
  onZoomChange?: (isZoomed: boolean, scale: number) => any;
  minZoom: number;
  maxZoom: number;
  fitScale?: number;
  src: string;
  alt: string;
  highResLoaded: boolean;
  onLoad?: () => void;
  children?: React.ReactNode;
}

export interface LivePhotoBadgeProps {
  livePhotoRef: React.RefObject<LivePhotoVideoHandle | null>;
  isLivePhotoPlaying: boolean;
  imageLoaderManagerRef: React.RefObject<ImageLoaderManager | null>;
}

export interface ProgressiveImageState {
  blobSrc: string | null;
  imageBlob: Blob | null;
  highResLoaded: boolean;
  error: boolean;
  isHighResImageRendered: boolean;
  currentScale: number;
  showScaleIndicator: boolean;
  isThumbnailLoaded: boolean;
  isLivePhotoPlaying: boolean;
}
