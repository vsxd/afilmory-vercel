export interface DisplayImage {
  url: string;
  width: number;
  height: number;
}

export interface DisplayImagePhoto {
  width?: number;
  height?: number;
  isHDR?: boolean;
  video?: { type: string } | null;
  displayImages?: readonly DisplayImage[];
}

/** Match the fitted photo, rather than the whole screen, to the canvas DPR cap. */
export function selectDisplayImage(
  photo: DisplayImagePhoto,
  viewport: { width: number; height: number; dpr: number },
  fitScale = 1,
): DisplayImage | undefined {
  const { width, height } = photo;
  if (
    photo.isHDR ||
    (photo.video && photo.video.type !== "none") ||
    !width ||
    !height ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return;
  const variants = photo.displayImages
    ?.filter(
      (variant) =>
        variant.url &&
        Number.isFinite(variant.width) &&
        Number.isFinite(variant.height) &&
        variant.width > 0 &&
        variant.height > 0,
    )
    .toSorted((a, b) => a.width * a.height - b.width * b.height);
  if (!variants?.length) return;

  const dpr = Math.min(2, Math.max(1, viewport.dpr || 1));
  const scale =
    Math.min(viewport.width / width, viewport.height / height, 1) *
    fitScale *
    dpr;
  return (
    variants.find(
      (variant) =>
        variant.width >= width * scale && variant.height >= height * scale,
    ) ?? variants.at(-1)
  );
}
