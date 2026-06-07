import type { TransformState } from "./transform-controller";

export interface DoubleClickToggleInput {
  isZoomed: boolean;
  point: {
    x: number;
    y: number;
  };
  transform: TransformState;
  canvasWidth: number;
  canvasHeight: number;
  fitToScreenScale: number;
  initialScale: number;
  minScale: number;
  maxScale: number;
  step: number;
}

export interface DoubleClickToggleResult {
  transform: TransformState;
  isZoomed: boolean;
}

export function resolveDoubleClickToggle(
  input: DoubleClickToggleInput,
): DoubleClickToggleResult {
  const configuredFitScale = input.fitToScreenScale * input.initialScale;
  const absoluteMinScale = input.fitToScreenScale * input.minScale;
  const originalSizeScale = 1;
  const userMaxScale = input.fitToScreenScale * input.maxScale;
  const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale);

  const targetScale = input.isZoomed
    ? Math.max(
        absoluteMinScale,
        Math.min(effectiveMaxScale, configuredFitScale),
      )
    : Math.max(
        absoluteMinScale,
        Math.min(
          effectiveMaxScale,
          Math.min(originalSizeScale, configuredFitScale * input.step),
        ),
      );

  const zoomX =
    (input.point.x - input.canvasWidth / 2 - input.transform.translateX) /
    input.transform.scale;
  const zoomY =
    (input.point.y - input.canvasHeight / 2 - input.transform.translateY) /
    input.transform.scale;

  return {
    transform: {
      scale: targetScale,
      translateX: input.point.x - input.canvasWidth / 2 - zoomX * targetScale,
      translateY: input.point.y - input.canvasHeight / 2 - zoomY * targetScale,
    },
    isZoomed: !input.isZoomed,
  };
}
