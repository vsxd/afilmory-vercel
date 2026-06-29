import type { SharpOptions } from "sharp";

/**
 * Shared sharp() input options for decoding SOURCE photos.
 *
 * - `failOn: "none"` — sharp defaults to `failOn: "warning"`, which rejects many
 *   real-world truncated-but-viewable JPEGs. Decoding as much as possible avoids
 *   silently dropping recoverable photos from the manifest.
 * - `limitInputPixels` — sharp defaults to ~268MP and throws above it, which
 *   rejects large panoramas. We raise the cap to 1 gigapixel so big panoramas
 *   decode while still bounding pathological/crafted inputs to avoid OOM.
 */
export const SOURCE_SHARP_OPTIONS = {
  failOn: "none",
  limitInputPixels: 1_000_000_000,
} satisfies SharpOptions;
