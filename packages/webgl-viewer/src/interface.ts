import type { LoadingState } from "./enum";

export interface WheelConfig {
  step: number;
  wheelDisabled?: boolean;
}
export interface PinchConfig {
  disabled?: boolean;
}
export interface DoubleClickConfig {
  step: number;
  disabled?: boolean;
  mode: "toggle" | "zoom";
  animationTime: number;
}
export interface PanningConfig {
  disabled?: boolean;
}
export interface WebGLImageViewerProps {
  src: string;
  sourceBlob?: Blob | null;
  className?: string;
  width?: number; // 可选的预知图片宽度，用于优化加载
  height?: number; // 可选的预知图片高度，用于优化加载
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  wheel?: WheelConfig;
  pinch?: PinchConfig;
  doubleClick?: DoubleClickConfig;
  panning?: PanningConfig;
  limitToBounds?: boolean;
  centerOnInit?: boolean;
  smooth?: boolean;
  onZoomChange?: (originalScale: number, relativeScale: number) => void;
  onLoadingStateChange?: (
    isLoading: boolean,
    state?: LoadingState,
    quality?: "high" | "medium" | "low" | "unknown",
  ) => void;
  onImagePainted?: () => void;
  onError?: (error: unknown) => void;
  debug?: boolean;
}
export interface WebGLImageViewerRef {
  zoomIn: (animated?: boolean) => void;
  zoomOut: (animated?: boolean) => void;
  resetView: () => void;
  getScale: () => number;
}

export interface DebugInfo {
  scale: number;
  relativeScale: number;
  translateX: number;
  translateY: number;
  currentLOD: number;
  lodLevels: number;
  canvasSize: { width: number; height: number };
  canvasBackingSize: { width: number; height: number };
  imageSize: { width: number; height: number };
  sourceImageSize: { width: number; height: number } | null;
  sourceScale: number;
  previewLimited: boolean;
  fitToScreenScale: number;
  userMaxScale: number;
  effectiveMaxScale: number;
  originalSizeScale: number;
  renderCount: number;
  maxTextureSize: number;
  quality: "high" | "medium" | "low" | "unknown";
  isLoading: boolean;
  memory: {
    /** 已缓存瓦片纹理的真实字节数（RGBA8，按每片实际尺寸累加）。 */
    tileTextureBytes: number;
    /** 底图回退纹理的真实字节数（按实际上传的位图尺寸）。 */
    baseTextureBytes: number;
    /** Texture subtotal only; excludes source pixels and canvas backing. */
    totalBytes: number;
    /** RGBA8-equivalent retained source pixels, not total decoder memory. */
    sourcePixelBytes: number;
    /** One RGBA8 canvas backing buffer, excluding driver/browser copies. */
    canvasBackingBytes: number;
    activeLODs: number;
  };
  tileSystem?: {
    cacheSize: number;
    visibleTiles: number;
    loadingTiles: number;
    pendingRequests: number;
    cacheLimit: number;
    maxTilesPerFrame: number;
    tileSize: number;
    cacheKeys: string[];
    visibleKeys: string[];
    loadingKeys: string[];
    pendingKeys: string[];
  };
  tileOutlinesEnabled?: boolean;
}
