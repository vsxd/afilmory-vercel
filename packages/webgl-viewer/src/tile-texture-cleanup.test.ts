import { describe, expect, it, vi } from "vitest";

import type { TileInfo } from "./tile-cache";
import { cleanupTileTextures } from "./tile-texture-cleanup";

const createTile = (lastUsed: number, texture: WebGLTexture): TileInfo => ({
  isLoading: false,
  lastUsed,
  lodLevel: 0,
  priority: 0,
  texture,
  x: 0,
  y: 0,
});

describe("cleanupTileTextures", () => {
  it("removes old invisible tiles and deletes their textures", () => {
    const visibleTexture = {} as WebGLTexture;
    const oldTexture = {} as WebGLTexture;
    const tileCache = new Map([
      ["0-0-0", createTile(900, visibleTexture)],
      ["1-0-0", createTile(100, oldTexture)],
    ]);
    const deleteTexture = vi.fn();

    const removed = cleanupTileTextures({
      currentVisibleTiles: new Set(["0-0-0"]),
      deleteTexture,
      maxAgeMs: 500,
      maxCacheSize: 10,
      now: 1000,
      tileCache,
    });

    expect(removed).toBe(1);
    expect(deleteTexture).toHaveBeenCalledWith(oldTexture);
    expect([...tileCache.keys()]).toEqual(["0-0-0"]);
  });
});
