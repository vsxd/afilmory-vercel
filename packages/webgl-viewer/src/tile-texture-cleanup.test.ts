import { describe, expect, it, vi } from "vitest";

import type { TileInfo } from "./tile-cache";
import {
  cleanupTileTextures,
  disposeAllTileTextures,
  reserveTileTextureSpace,
} from "./tile-texture-cleanup";

const createTile = (lastUsed: number, texture: WebGLTexture): TileInfo => ({
  isLoading: false,
  lastUsed,
  lodLevel: 0,
  priority: 0,
  texture,
  x: 0,
  y: 0,
  byteSize: 512 * 512 * 4,
});

describe("reserveTileTextureSpace", () => {
  it("removes off-plan tiles before admitted prefetch, without evicting visible tiles", () => {
    const visible = createTile(0, {} as WebGLTexture);
    const prefetch = createTile(1, {} as WebGLTexture);
    const stale = createTile(2, {} as WebGLTexture);
    const tileCache = new Map([
      ["visible", visible],
      ["prefetch", prefetch],
      ["stale", stale],
    ]);
    const deleteTexture = vi.fn();
    const admission = {
      byteSize: visible.byteSize,
      currentVisibleTiles: new Set(["visible"]),
      admittedTiles: new Set(["visible", "prefetch", "incoming"]),
      deleteTexture,
      maxCacheBytes: 3 * visible.byteSize,
      maxCacheSize: 3,
      tileCache,
    };
    expect(reserveTileTextureSpace(admission)).toBe(true);
    expect(deleteTexture).toHaveBeenCalledExactlyOnceWith(stale.texture);
    expect([...tileCache.keys()]).toEqual(["visible", "prefetch"]);
    expect(reserveTileTextureSpace({ ...admission, maxCacheSize: 1 })).toBe(
      false,
    );
    expect([...tileCache.keys()]).toEqual(["visible"]);
  });

  it("rejects a single oversized allocation without deleting existing textures", () => {
    const tile = createTile(0, {} as WebGLTexture);
    const tileCache = new Map([["tile", tile]]);
    const deleteTexture = vi.fn();
    expect(
      reserveTileTextureSpace({
        byteSize: tile.byteSize + 1,
        currentVisibleTiles: new Set(),
        admittedTiles: new Set(),
        deleteTexture,
        maxCacheBytes: tile.byteSize,
        maxCacheSize: 32,
        tileCache,
      }),
    ).toBe(false);
    expect(deleteTexture).not.toHaveBeenCalled();
  });
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

  it("evicts least-recently-used invisible textures to stay under byte budget", () => {
    const oldest = createTile(1, {} as WebGLTexture);
    const newest = createTile(2, {} as WebGLTexture);
    oldest.byteSize = 10;
    newest.byteSize = 10;
    const tileCache = new Map([
      ["old", oldest],
      ["new", newest],
    ]);
    const deleteTexture = vi.fn();

    cleanupTileTextures({
      currentVisibleTiles: new Set(),
      deleteTexture,
      maxCacheBytes: 10,
      maxCacheSize: 10,
      now: 2,
      tileCache,
    });

    expect([...tileCache.keys()]).toEqual(["new"]);
    expect(deleteTexture).toHaveBeenCalledWith(oldest.texture);
  });
});

describe("disposeAllTileTextures", () => {
  it("deletes every tile texture and clears the cache regardless of visibility/age", () => {
    const textureA = {} as WebGLTexture;
    const textureB = {} as WebGLTexture;
    const tileCache = new Map([
      ["0-0-0", createTile(Date.now(), textureA)],
      ["1-0-0", createTile(Date.now(), textureB)],
      ["2-0-0", { ...createTile(Date.now(), null as never), texture: null }],
    ]);
    const deleteTexture = vi.fn();

    const removed = disposeAllTileTextures({ deleteTexture, tileCache });

    expect(removed).toBe(2);
    expect(deleteTexture).toHaveBeenCalledWith(textureA);
    expect(deleteTexture).toHaveBeenCalledWith(textureB);
    expect(tileCache.size).toBe(0);
  });
});
