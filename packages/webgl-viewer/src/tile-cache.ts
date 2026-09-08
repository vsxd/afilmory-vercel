export const TILE_SIZE = 512;
export const MAX_TILES_PER_FRAME = 4;
export const TILE_CACHE_SIZE = 32;
export const TILE_CACHE_BYTE_BUDGET = 32 * 1024 * 1024;
export const TEXTURE_BYTES_PER_PIXEL = 4;

export interface TileInfo {
  x: number;
  y: number;
  lodLevel: number;
  texture: WebGLTexture | null;
  lastUsed: number;
  isLoading: boolean;
  priority: number;
  /** Actual RGBA8 allocation size for byte-budgeted eviction/debugging. */
  byteSize: number;
}

export type TileKey = string;

export const SIMPLE_LOD_LEVELS = [
  { scale: 0.25 },
  { scale: 0.5 },
  { scale: 1 },
  { scale: 2 },
  { scale: 4 },
] as const;

export function createTileKey(x: number, y: number, lodLevel: number): TileKey {
  return `${x}-${y}-${lodLevel}`;
}

export function parseTileKey(key: TileKey): {
  x: number;
  y: number;
  lodLevel: number;
} {
  const [x, y, lodLevel] = key.split("-").map(Number);
  return { x, y, lodLevel };
}

export function getTileGridSize(input: {
  imageWidth: number;
  imageHeight: number;
  lodLevel: number;
}): { cols: number; rows: number } {
  const lodConfig = SIMPLE_LOD_LEVELS[input.lodLevel];
  const scaledWidth = input.imageWidth * lodConfig.scale;
  const scaledHeight = input.imageHeight * lodConfig.scale;

  return {
    cols: Math.ceil(scaledWidth / TILE_SIZE),
    rows: Math.ceil(scaledHeight / TILE_SIZE),
  };
}

/**
 * Actual pixel dimensions of one tile's bitmap. Interior tiles are
 * TILE_SIZE × TILE_SIZE; edge tiles are smaller. Mirrors the slicing math in
 * texture-worker-runtime.ts so memory accounting matches what the worker produces.
 */
export function getTilePixelSize(input: {
  x: number;
  y: number;
  lodLevel: number;
  imageWidth: number;
  imageHeight: number;
}): { width: number; height: number } {
  const lodConfig = SIMPLE_LOD_LEVELS[input.lodLevel];
  if (!lodConfig || input.imageWidth <= 0 || input.imageHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const { cols, rows } = getTileGridSize({
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    lodLevel: input.lodLevel,
  });

  const sourceWidth = input.imageWidth / cols;
  const sourceHeight = input.imageHeight / rows;
  const actualSourceWidth = Math.min(
    sourceWidth,
    input.imageWidth - input.x * sourceWidth,
  );
  const actualSourceHeight = Math.min(
    sourceHeight,
    input.imageHeight - input.y * sourceHeight,
  );

  return {
    width: Math.max(
      0,
      Math.min(TILE_SIZE, Math.ceil(actualSourceWidth * lodConfig.scale)),
    ),
    height: Math.max(
      0,
      Math.min(TILE_SIZE, Math.ceil(actualSourceHeight * lodConfig.scale)),
    ),
  };
}
