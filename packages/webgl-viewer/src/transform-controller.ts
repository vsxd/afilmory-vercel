export interface ViewportGeometry {
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
}

export interface TransformState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface TransformBounds {
  initialScale: number;
  limitToBounds: boolean;
  maxScale: number;
  minScale: number;
}

export function getFitToScreenScale(geometry: ViewportGeometry): number {
  // 防御非正/非有限的图片尺寸：manifest 会把损坏的 width/height 归一成 0
  // （schema manifest.ts），若直接相除会得到 Infinity/NaN 并污染整个 transform
  // （scale → translate → zoomAtTransform 再除以 scale）。此时退回安全比例 1。
  const { canvasWidth, canvasHeight, imageWidth, imageHeight } = geometry;
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return 1;
  }

  const scaleX = canvasWidth / imageWidth;
  const scaleY = canvasHeight / imageHeight;
  const fit = Math.min(scaleX, scaleY);
  return Number.isFinite(fit) && fit > 0 ? fit : 1;
}

export function createFitTransform(
  geometry: ViewportGeometry,
  initialScale: number,
): TransformState {
  return {
    scale: getFitToScreenScale(geometry) * initialScale,
    translateX: 0,
    translateY: 0,
  };
}

export function constrainImagePosition(
  transform: TransformState,
  geometry: ViewportGeometry,
  limitToBounds: boolean,
): TransformState {
  if (!limitToBounds) {
    return { ...transform };
  }

  const fitScale = getFitToScreenScale(geometry);
  if (transform.scale <= fitScale) {
    return {
      ...transform,
      translateX: 0,
      translateY: 0,
    };
  }

  const scaledWidth = geometry.imageWidth * transform.scale;
  const scaledHeight = geometry.imageHeight * transform.scale;
  const maxTranslateX = Math.max(0, (scaledWidth - geometry.canvasWidth) / 2);
  const maxTranslateY = Math.max(0, (scaledHeight - geometry.canvasHeight) / 2);

  return {
    ...transform,
    translateX: Math.max(
      -maxTranslateX,
      Math.min(maxTranslateX, transform.translateX),
    ),
    translateY: Math.max(
      -maxTranslateY,
      Math.min(maxTranslateY, transform.translateY),
    ),
  };
}

export function constrainScaleAndPosition(
  transform: TransformState,
  geometry: ViewportGeometry,
  bounds: TransformBounds,
): TransformState {
  const fitToScreenScale = getFitToScreenScale(geometry);
  const absoluteMinScale = fitToScreenScale * bounds.minScale;
  const originalSizeScale = 1;
  const userMaxScale = fitToScreenScale * bounds.maxScale;
  const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale);
  const scale = Math.max(
    absoluteMinScale,
    Math.min(effectiveMaxScale, transform.scale),
  );

  return constrainImagePosition(
    {
      ...transform,
      scale,
    },
    geometry,
    bounds.limitToBounds,
  );
}

export function zoomAtTransform(
  transform: TransformState,
  geometry: ViewportGeometry,
  bounds: TransformBounds,
  point: { x: number; y: number },
  scaleFactor: number,
): TransformState | null {
  const newScale = transform.scale * scaleFactor;
  const fitToScreenScale = getFitToScreenScale(geometry);
  const absoluteMinScale = fitToScreenScale * bounds.minScale;
  const originalSizeScale = 1;
  const userMaxScale = fitToScreenScale * bounds.maxScale;
  const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale);

  if (newScale < absoluteMinScale || newScale > effectiveMaxScale) {
    return null;
  }

  const zoomX =
    (point.x - geometry.canvasWidth / 2 - transform.translateX) /
    transform.scale;
  const zoomY =
    (point.y - geometry.canvasHeight / 2 - transform.translateY) /
    transform.scale;

  return constrainImagePosition(
    {
      scale: newScale,
      translateX: point.x - geometry.canvasWidth / 2 - zoomX * newScale,
      translateY: point.y - geometry.canvasHeight / 2 - zoomY * newScale,
    },
    geometry,
    bounds.limitToBounds,
  );
}
