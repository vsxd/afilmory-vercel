import { clampDimensionsToFit } from "./texture-dimensions";
import { SIMPLE_LOD_LEVELS } from "./tile-cache";

// These limit the retained RGBA8 source bitmap, separately from GL textures.
export const SOURCE_IMAGE_BYTE_BUDGET = 64 * 1024 * 1024;
export const MOBILE_SOURCE_IMAGE_BYTE_BUDGET = 32 * 1024 * 1024;

export interface ImageDimensions {
  width: number;
  height: number;
}

export function getSourceImageScale(
  logical: ImageDimensions,
  source: ImageDimensions | null,
): number {
  if (!source || !hasImageDimensions(logical) || !hasImageDimensions(source))
    return 1;
  return Math.min(
    1,
    source.width / logical.width,
    source.height / logical.height,
  );
}

/** Use the first grid reaching available pixels, never a 2x/4x upscale grid. */
export function selectSourceLimitedLod(
  requiredScale: number,
  availableScale: number,
): number {
  const scale = Math.min(requiredScale, availableScale, 1);
  return SIMPLE_LOD_LEVELS.findIndex((lod) => lod.scale >= scale);
}

export function hasImageDimensions(
  dimensions: Partial<ImageDimensions>,
): dimensions is ImageDimensions {
  return (
    Number.isSafeInteger(dimensions.width) &&
    Number.isSafeInteger(dimensions.height) &&
    dimensions.width! > 0 &&
    dimensions.height! > 0
  );
}

export function sourceImageDimensions(
  dimensions: ImageDimensions,
  maxBytes = SOURCE_IMAGE_BYTE_BUDGET,
): ImageDimensions {
  if (!hasImageDimensions(dimensions))
    throw new Error("Invalid source image dimensions");
  const budget =
    Number.isFinite(maxBytes) && maxBytes >= 4
      ? Math.min(maxBytes, SOURCE_IMAGE_BYTE_BUDGET)
      : SOURCE_IMAGE_BYTE_BUDGET;
  return clampDimensionsToFit(
    dimensions.width,
    dimensions.height,
    Math.min(8192, Math.floor(budget / 4)),
    budget,
  );
}

/** Mobile includes desktop-mode iPads; touch-capable laptops keep desktop policy. */
export function getSourceImageByteBudget(): number {
  if (typeof navigator === "undefined") return SOURCE_IMAGE_BYTE_BUDGET;
  const touchPoints =
    "maxTouchPoints" in navigator ? Number(navigator.maxTouchPoints) : 0;
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && touchPoints > 1);
  return mobile ? MOBILE_SOURCE_IMAGE_BYTE_BUDGET : SOURCE_IMAGE_BYTE_BUDGET;
}
