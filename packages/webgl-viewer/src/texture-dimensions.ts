/** Keep one fallback texture below 64 MiB even on 8K-capable GPUs. */
export const BASE_TEXTURE_BYTE_BUDGET = 64 * 1024 * 1024;

/**
 * 等比缩小到边长与 RGBA8 字节预算内的最大尺寸；非正上限表示不应用该上限。
 */
export function clampDimensionsToFit(
  width: number,
  height: number,
  maxSize: number,
  maxBytes = 0,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: Math.max(0, width), height: Math.max(0, height) };
  }
  const sizeRatio =
    maxSize > 0 ? Math.min(1, maxSize / width, maxSize / height) : 1;
  const byteRatio =
    maxBytes > 0
      ? Math.min(
          1,
          Math.sqrt(maxBytes / (width * height * 4)), // RGBA8 bytes per pixel
        )
      : 1;
  const ratio = Math.min(sizeRatio, byteRatio);
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
  };
}
