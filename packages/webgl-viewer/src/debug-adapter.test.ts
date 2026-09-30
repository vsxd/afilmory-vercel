import { describe, expect, it } from "vitest";

import type { WebGLDebugAdapterInput } from "./debug-adapter";
import { createWebGLDebugInfo } from "./debug-adapter";
import type { TileInfo, TileKey } from "./tile-cache";

function createInput(
  overrides: Partial<WebGLDebugAdapterInput> = {},
): WebGLDebugAdapterInput {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
    currentLOD: 1,
    lodLevelCount: 5,
    canvasWidth: 100,
    canvasHeight: 100,
    imageWidth: 1024,
    imageHeight: 1024,
    fitToScreenScale: 0.5,
    userMaxScale: 5,
    effectiveMaxScale: 5,
    originalSizeScale: 1,
    renderCount: 42,
    maxTextureSize: 4096,
    quality: "medium",
    isLoading: false,
    tileOutlineEnabled: false,
    baseTextureSize: null,
    sourceImageSize: null,
    canvasBackingSize: { width: 100, height: 100 },
    tileCache: new Map<TileKey, TileInfo>(),
    currentVisibleTiles: new Set<TileKey>(),
    loadingTiles: new Map(),
    pendingTileRequests: new Map(),
    ...overrides,
  };
}

function tile(
  x: number,
  y: number,
  lodLevel: number,
  byteSize = 512 * 512 * 4,
): TileInfo {
  return {
    x,
    y,
    lodLevel,
    texture: {} as WebGLTexture,
    lastUsed: 0,
    isLoading: false,
    priority: 0,
    byteSize,
  };
}

describe("createWebGLDebugInfo", () => {
  it("separates retained pixels, texture subtotal and canvas backing in a limited preview", () => {
    const info = createWebGLDebugInfo(
      createInput({
        imageWidth: 8000,
        imageHeight: 6000,
        sourceImageSize: { width: 2000, height: 1500 },
        canvasBackingSize: { width: 200, height: 200 },
        baseTextureSize: { width: 1000, height: 750 },
      }),
    );
    expect(info.previewLimited).toBe(true);
    expect(info.sourceScale).toBe(0.25);
    expect(info.sourceImageSize).toEqual({ width: 2000, height: 1500 });
    expect(info.memory.sourcePixelBytes).toBe(2000 * 1500 * 4);
    expect(info.memory.canvasBackingBytes).toBe(200 * 200 * 4);
    expect(info.memory.totalBytes).toBe(1000 * 750 * 4);
    expect(info.imageSize).toEqual({ width: 8000, height: 6000 });
  });
  it("sums tile memory from real tile dimensions (RGBA8)", () => {
    // 1024² at LOD 2 → 2×2 grid of exactly 512² tiles → 1 MiB each
    const tileCache = new Map<TileKey, TileInfo>([
      ["0-0-2", tile(0, 0, 2)],
      ["1-1-2", tile(1, 1, 2)],
    ]);

    const info = createWebGLDebugInfo(createInput({ tileCache }));

    expect(info.memory.tileTextureBytes).toBe(2 * 512 * 512 * 4);
    expect(info.memory.baseTextureBytes).toBe(0);
    expect(info.memory.totalBytes).toBe(2 * 512 * 512 * 4);
    expect(info.memory.activeLODs).toBe(0);
  });

  it("uses smaller real dimensions for non-divisible grids, not a per-tile constant", () => {
    // 1300×700 at LOD 2 → 3×2 grid → 每片 434×350，远小于虚构的 4MiB/片
    const byteSize = Math.ceil(1300 / 3) * Math.ceil(700 / 2) * 4;
    const tileCache = new Map<TileKey, TileInfo>([
      ["0-0-2", tile(0, 0, 2, byteSize)],
    ]);

    const info = createWebGLDebugInfo(
      createInput({ imageWidth: 1300, imageHeight: 700, tileCache }),
    );

    expect(info.memory.tileTextureBytes).toBe(byteSize);
  });

  it("skips tiles without an uploaded texture", () => {
    const tileCache = new Map<TileKey, TileInfo>([
      ["0-0-2", { ...tile(0, 0, 2), texture: null }],
    ]);

    const info = createWebGLDebugInfo(createInput({ tileCache }));

    expect(info.memory.tileTextureBytes).toBe(0);
  });

  it("reports base texture bytes from the actual bitmap size and passes the real frame count through", () => {
    const info = createWebGLDebugInfo(
      createInput({
        baseTextureSize: { width: 512, height: 384 },
        renderCount: 1337,
      }),
    );

    expect(info.memory.baseTextureBytes).toBe(512 * 384 * 4);
    expect(info.memory.activeLODs).toBe(1);
    expect(info.renderCount).toBe(1337);
  });
});
