import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PhotoDisplayImage } from "@afilmory/schema";
import type { Sharp } from "sharp";
import sharp from "sharp";

import { writeFileAtomic } from "../utils/atomic-write.js";

export const DISPLAY_IMAGE_EDGES = [960, 1600, 2560] as const;
export const DISPLAY_IMAGE_SIGNATURE =
  "display:v1:960-1600-2560:jpeg-q85-mozjpeg-srgb";
const MAX_DISPLAY_IMAGE_ID_BYTES =
  255 -
  Buffer.byteLength(
    `.${"0".repeat(64)}.display-${Math.max(...DISPLAY_IMAGE_EDGES)}.jpg`,
  );

/** Separate namespace from thumbnails, while sharing their static/cache directory. */
export function getDisplayImagePhotoId(fileName: string): string | null {
  return (
    fileName.match(
      /^(.*)\.[\da-f]{64}(?:\.[\da-f]{12})?\.display-\d+\.jpg$/i,
    )?.[1] ?? null
  );
}

export function getDisplayImageFileName(
  url: string,
  photoId: string,
): string | null {
  try {
    const parsed = new URL(url, "https://afilmory.invalid");
    if (
      parsed.origin !== "https://afilmory.invalid" ||
      !parsed.pathname.startsWith("/thumbnails/")
    )
      return null;
    const fileName = decodeURIComponent(
      parsed.pathname.slice("/thumbnails/".length),
    );
    if (
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("\0")
    )
      return null;
    return getDisplayImagePhotoId(fileName) === photoId ? fileName : null;
  } catch {
    return null;
  }
}

export async function displayImagesExist(
  photoId: string,
  images: readonly PhotoDisplayImage[] | undefined,
  directory: string,
): Promise<boolean> {
  if (!images) return false;
  for (const image of images) {
    const fileName = getDisplayImageFileName(image.url, photoId);
    if (!fileName) return false;
    try {
      const stat = await fs.lstat(path.join(directory, fileName));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
        return false;
    } catch (error) {
      if (
        ["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        return false;
      throw error;
    }
  }
  return true;
}

/** Decode once to a bounded, oriented sRGB raster; all encoders share its pixels. */
export async function generateDisplayImages(
  source: Sharp,
  photoId: string,
  directory: string,
  {
    preserveOriginal = false,
    signal,
  }: { preserveOriginal?: boolean; signal?: AbortSignal } = {},
): Promise<PhotoDisplayImage[]> {
  signal?.throwIfAborted();
  if (preserveOriginal) return [];
  // Historical manifests can retain longer IDs than the current builder
  // creates. Keep those photos on the original path instead of failing every
  // incremental build because the derived filename would exceed NAME_MAX.
  if (Buffer.byteLength(photoId) > MAX_DISPLAY_IMAGE_ID_BYTES) return [];
  const metadata = await source.metadata();
  // Never replace transparent/animated/high-bit-depth media with a flattened SDR JPEG.
  if (
    metadata.hasAlpha ||
    metadata.gainMap?.image ||
    (metadata.pages ?? 1) > 1 ||
    (metadata.depth && metadata.depth !== "uchar")
  )
    return [];
  const { data, info } = await source
    .clone()
    .rotate()
    .resize({
      width: DISPLAY_IMAGE_EDGES.at(-1),
      height: DISPLAY_IMAGE_EDGES.at(-1),
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  signal?.throwIfAborted();
  const longestEdge = Math.max(info.width, info.height);
  const edges = [
    ...new Set(DISPLAY_IMAGE_EDGES.map((edge) => Math.min(edge, longestEdge))),
  ];
  const images: PhotoDisplayImage[] = [];
  for (const edge of edges) {
    const { data: encoded, info: output } = await sharp(data, { raw: info })
      .resize({
        width: edge,
        height: edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    const hash = createHash("sha256").update(encoded).digest("hex");
    // The encoded content hash already changes with encoding parameters. Keep
    // the suffix within the thumbnail naming allowance for 170-byte photo IDs.
    const fileName = `${photoId}.${hash}.display-${edge}.jpg`;
    if (
      path.basename(fileName) !== fileName ||
      fileName.includes("\\") ||
      Buffer.byteLength(fileName) > 255
    )
      throw new Error("Invalid display image filename");
    await writeFileAtomic(path.join(directory, fileName), encoded);
    images.push({
      url: `/thumbnails/${encodeURIComponent(fileName)}`,
      width: output.width,
      height: output.height,
    });
  }
  return images;
}
