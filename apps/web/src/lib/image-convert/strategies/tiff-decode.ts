import { decode } from "tiff";

import { MediaTaskError } from "../../media-task";
import type { TiffDecodeBudget } from "./tiff-limits";
import { assertTiffInputSize, tiffResourceLimit } from "./tiff-limits";
import { assertTiffPixelLayout, tiffPixelsToRgba } from "./tiff-pixels";

/** Metadata-only first-page inspection: this must precede every pixel decode. */
export function inspectTiff(bytes: ArrayBuffer, budget: TiffDecodeBudget) {
  assertTiffInputSize(bytes.byteLength, budget);
  let frame;
  try {
    [frame] = decode(bytes, { pages: [0], ignoreImageData: true });
  } catch (cause) {
    throw new MediaTaskError("detect", "invalid-image", "Invalid TIFF header", {
      cause,
    });
  }
  if (!frame)
    throw new MediaTaskError("detect", "invalid-image", "Missing TIFF page");
  const { width, height, components } = frame;
  // Native Safari may support layouts our JS converter does not. Estimate all
  // samples conservatively here; conversion-specific checks happen separately.
  const rawBits: unknown = frame.get("BitsPerSample");
  const bits =
    rawBits instanceof Uint16Array
      ? [...rawBits]
      : Array.isArray(rawBits)
        ? rawBits
        : [rawBits ?? 1];
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(components) ||
    components <= 0 ||
    components > 8 ||
    bits.length === 0 ||
    bits.length > 8 ||
    bits.some((bit) => !Number.isInteger(bit) || bit <= 0 || bit > 64)
  )
    throw tiffResourceLimit();
  const pixels = width * height;
  const sampleBytes = Math.max(1, Math.ceil(Math.max(...bits) / 8));
  const tileWidth: unknown = frame.get("TileWidth");
  const tileHeight: unknown = frame.get("TileLength");
  const rows: unknown = frame.get("RowsPerStrip");
  const hasTiles = tileWidth !== undefined || tileHeight !== undefined;
  const blockWidth = hasTiles ? tileWidth : width;
  // Omitted RowsPerStrip and the TIFF default sentinel mean one whole-image
  // strip. Other values conservatively budget the full declared strip scratch.
  const blockHeight = hasTiles
    ? tileHeight
    : rows === undefined || rows === 0xffffffff
      ? height
      : rows;
  const validBlockEdge = (edge: unknown): edge is number =>
    typeof edge === "number" &&
    Number.isSafeInteger(edge) &&
    edge > 0 &&
    edge <= budget.maxDimension;
  if (!validBlockEdge(blockWidth) || !validBlockEdge(blockHeight))
    throw tiffResourceLimit();
  // Tiles are fully decompressed before cropping to image bounds. Count the
  // declared block, including padding, and both inflater scratch/output copies.
  const scratchBytes = blockWidth * blockHeight * components * sampleBytes;
  // Input/blob copies, decoded samples and three RGBA copies (ImageData,
  // canvas backing, encoder scratch). This is a conservative
  // admission estimate, not a guarantee about total browser process memory.
  const estimatedBytes =
    bytes.byteLength * 2 +
    pixels * (components * sampleBytes + 4 * 3) +
    scratchBytes * 2;
  if (
    !Number.isSafeInteger(estimatedBytes) ||
    width > budget.maxDimension ||
    height > budget.maxDimension ||
    estimatedBytes > budget.maxBytes
  )
    throw tiffResourceLimit();
  return frame;
}

export function decodeFirstTiffPage(
  bytes: ArrayBuffer,
  budget: TiffDecodeBudget,
) {
  const header = inspectTiff(bytes, budget);
  assertTiffPixelLayout(header);
  // The installed codec's tiled path drops channels after the first. Keep
  // native Safari support, but do not publish incorrectly colored conversions.
  if (header.tileWidth !== undefined && header.components > 1)
    throw new Error("Multichannel tiled TIFF conversion is unsupported");
  const frame = decode(bytes, { pages: [0] })[0];
  if (!frame) throw new Error("Failed to decode TIFF image");
  return frame;
}

// Shared by DOM and Worker canvases without importing Window-only globals into
// the worker module graph.
interface TiffCanvas {
  width: number;
  height: number;
  getContext: (type: "2d") => {
    createImageData: (width: number, height: number) => ImageData;
    putImageData: (image: ImageData, x: number, y: number) => void;
  } | null;
}

export function paintTiff<Canvas extends TiffCanvas>(
  bytes: ArrayBuffer,
  budget: TiffDecodeBudget,
  createCanvas: (width: number, height: number) => Canvas,
) {
  const frame = decodeFirstTiffPage(bytes, budget);
  const canvas = createCanvas(frame.width, frame.height);
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Failed to get canvas context");
    const image = context.createImageData(frame.width, frame.height);
    tiffPixelsToRgba(frame, image.data);
    context.putImageData(image, 0, 0);
    return { canvas, format: frame.alpha ? "image/png" : "image/jpeg" };
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  }
}
