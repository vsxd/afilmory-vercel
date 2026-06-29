import type { TileInfo, TileKey } from "./tile-cache";

export const DEFAULT_TILE_MAX_AGE_MS = 30_000;

export function cleanupTileTextures({
  currentVisibleTiles,
  deleteTexture,
  maxAgeMs = DEFAULT_TILE_MAX_AGE_MS,
  maxCacheSize,
  now,
  tileCache,
}: {
  currentVisibleTiles: Set<TileKey>;
  deleteTexture: (texture: WebGLTexture) => void;
  maxAgeMs?: number;
  maxCacheSize: number;
  now: number;
  tileCache: Map<TileKey, TileInfo>;
}): number {
  let removed = 0;

  if (tileCache.size > maxCacheSize) {
    const tilesToRemove = Array.from(tileCache.entries())
      .filter(([key]) => !currentVisibleTiles.has(key))
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
      .slice(0, tileCache.size - maxCacheSize + 5);

    for (const [key, tileInfo] of tilesToRemove) {
      if (tileInfo.texture) {
        deleteTexture(tileInfo.texture);
      }
      tileCache.delete(key);
      removed++;
    }
  }

  for (const [key, tileInfo] of tileCache.entries()) {
    if (!currentVisibleTiles.has(key) && now - tileInfo.lastUsed > maxAgeMs) {
      if (tileInfo.texture) {
        deleteTexture(tileInfo.texture);
      }
      tileCache.delete(key);
      removed++;
    }
  }

  return removed;
}

/**
 * Delete EVERY cached tile texture and clear the cache, regardless of
 * visibility or age. Use this on engine teardown: the React wrapper reuses the
 * same canvas/WebGL context across image changes, so tile textures left in the
 * cache leak GPU memory that accumulates with every viewed photo.
 */
export function disposeAllTileTextures({
  deleteTexture,
  tileCache,
}: {
  deleteTexture: (texture: WebGLTexture) => void;
  tileCache: Map<TileKey, TileInfo>;
}): number {
  let removed = 0;
  for (const tileInfo of tileCache.values()) {
    if (tileInfo.texture) {
      deleteTexture(tileInfo.texture);
      removed++;
    }
  }
  tileCache.clear();
  return removed;
}
