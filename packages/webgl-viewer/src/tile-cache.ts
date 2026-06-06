export const TILE_SIZE = 512;
export const MAX_TILES_PER_FRAME = 4;
export const TILE_CACHE_SIZE = 32;

export interface TileInfo {
  x: number;
  y: number;
  lodLevel: number;
  texture: WebGLTexture | null;
  lastUsed: number;
  isLoading: boolean;
  priority: number;
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
