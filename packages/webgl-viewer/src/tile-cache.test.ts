import { describe, expect, it } from "vitest";

import {
  createTileKey,
  getTileGridSize,
  getTilePixelSize,
  parseTileKey,
  SIMPLE_LOD_LEVELS,
  TILE_SIZE,
} from "./tile-cache";

describe("createTileKey / parseTileKey", () => {
  it("round-trips coordinates through the key format", () => {
    for (const [x, y, lodLevel] of [
      [0, 0, 0],
      [1, 2, 3],
      [17, 42, 4],
    ] as const) {
      expect(parseTileKey(createTileKey(x, y, lodLevel))).toEqual({
        x,
        y,
        lodLevel,
      });
    }
  });

  it("parses the documented key layout", () => {
    expect(createTileKey(3, 5, 2)).toBe("3-5-2");
    expect(parseTileKey("3-5-2")).toEqual({ x: 3, y: 5, lodLevel: 2 });
  });
});

describe("getTileGridSize", () => {
  it("scales the image by the LOD level and divides into TILE_SIZE tiles", () => {
    expect(
      getTileGridSize({ imageWidth: 4000, imageHeight: 3000, lodLevel: 2 }),
    ).toEqual({
      cols: Math.ceil(4000 / TILE_SIZE),
      rows: Math.ceil(3000 / TILE_SIZE),
    });

    const lodConfig = SIMPLE_LOD_LEVELS[4];
    expect(
      getTileGridSize({ imageWidth: 1000, imageHeight: 500, lodLevel: 4 }),
    ).toEqual({
      cols: Math.ceil((1000 * lodConfig.scale) / TILE_SIZE),
      rows: Math.ceil((500 * lodConfig.scale) / TILE_SIZE),
    });
  });
});

describe("getTilePixelSize", () => {
  it("slices the image uniformly, so tiles are smaller than TILE_SIZE unless it divides evenly", () => {
    // 1300×700 at LOD 2 (scale 1): grid 3×2 → 每片 434×350，而不是 512×512
    // （与 texture-worker-runtime.ts 的均匀切片一致；老的 4MiB/片 估算完全失真）
    const base = { imageWidth: 1300, imageHeight: 700, lodLevel: 2 };

    expect(getTilePixelSize({ ...base, x: 0, y: 0 })).toEqual({
      width: Math.ceil(1300 / 3),
      height: Math.ceil(700 / 2),
    });
    expect(getTilePixelSize({ ...base, x: 2, y: 1 })).toEqual({
      width: Math.ceil(1300 / 3),
      height: Math.ceil(700 / 2),
    });
  });

  it("caps tiles at TILE_SIZE for exactly divisible images", () => {
    expect(
      getTilePixelSize({
        imageWidth: 1024,
        imageHeight: 1024,
        lodLevel: 2,
        x: 0,
        y: 0,
      }),
    ).toEqual({ width: TILE_SIZE, height: TILE_SIZE });
  });

  it("accounts for the LOD scale factor", () => {
    // LOD 3 (scale 2): 600×600 → 1200×1200 scaled → 3×3 grid, edge = 176
    expect(
      getTilePixelSize({
        imageWidth: 600,
        imageHeight: 600,
        lodLevel: 3,
        x: 2,
        y: 2,
      }),
    ).toEqual({
      width: Math.ceil((600 - 2 * (600 / 3)) * 2),
      height: Math.ceil((600 - 2 * (600 / 3)) * 2),
    });
  });

  it("returns zero for unknown LOD levels or empty images", () => {
    expect(
      getTilePixelSize({
        imageWidth: 1000,
        imageHeight: 1000,
        lodLevel: 99,
        x: 0,
        y: 0,
      }),
    ).toEqual({ width: 0, height: 0 });
    expect(
      getTilePixelSize({
        imageWidth: 0,
        imageHeight: 0,
        lodLevel: 2,
        x: 0,
        y: 0,
      }),
    ).toEqual({ width: 0, height: 0 });
  });
});
