import { describe, expect, it } from "vitest";

import {
  createTileKey,
  TILE_CACHE_BYTE_BUDGET,
  TILE_CACHE_SIZE,
} from "./tile-cache";
import {
  calculateVisibleTiles,
  createViewportHash,
  planTilesWithinBudget,
  selectPendingTileBatch,
} from "./tile-scheduler";

const viewport = {
  canvasWidth: 390,
  canvasHeight: 844,
  imageWidth: 6000,
  imageHeight: 4000,
  imageLoaded: true,
  lodLevel: 2,
  scale: 0.26,
  translateX: 0,
  translateY: 0,
};
const budget = {
  maxCacheBytes: TILE_CACHE_BYTE_BUDGET,
  maxCacheSize: TILE_CACHE_SIZE,
};

describe("budgeted tile plan", () => {
  it("separates real visibility from prefetch without exceeding the mobile regression budget", () => {
    const plan = planTilesWithinBudget(viewport, budget, () => false);
    expect(plan.lodLevel).toBe(2);
    expect(plan.visibleTiles).toHaveLength(32);
    expect(plan.prefetchTiles).toHaveLength(0);
    expect(plan.byteSize).toBeLessThanOrEqual(budget.maxCacheBytes);
  });

  it("reduces LOD for visible tiles before spending any budget on prefetch", () => {
    const plan = planTilesWithinBudget(
      { ...viewport, canvasWidth: 600, canvasHeight: 400, scale: 0.1 },
      budget,
      () => false,
    );
    expect(plan.lodLevel).toBe(1);
    expect(plan.visibleTiles).toHaveLength(24);
    expect(plan.byteSize).toBeLessThanOrEqual(budget.maxCacheBytes);
    expect(
      plan.visibleTiles.length + plan.prefetchTiles.length,
    ).toBeLessThanOrEqual(budget.maxCacheSize);
  });

  it("respects a byte limit independently of the tile-count limit", () => {
    const plan = planTilesWithinBudget(
      {
        ...viewport,
        canvasWidth: 1000,
        canvasHeight: 1000,
        imageWidth: 1000,
        imageHeight: 1000,
        scale: 1,
      },
      { ...budget, maxCacheBytes: 2 * 1024 * 1024 },
      () => false,
    );
    expect(plan.lodLevel).toBe(1);
    expect(plan.byteSize).toBe(500 * 500 * 4);
  });

  it("falls back to the base if the lowest LOD cannot fit or the base already covers it", () => {
    expect(
      planTilesWithinBudget(
        viewport,
        { ...budget, maxCacheBytes: 1 },
        () => false,
      ).lodLevel,
    ).toBeNull();
    expect(
      planTilesWithinBudget(
        { ...viewport, canvasWidth: 600, canvasHeight: 400, scale: 0.1 },
        budget,
        (lod) => lod <= 1,
      ).lodLevel,
    ).toBeNull();
  });

  it("counts tile ranges before enumerating enormous image metadata", () => {
    const plan = planTilesWithinBudget(
      { ...viewport, imageWidth: 1e9, imageHeight: 1e9, scale: 1e-7 },
      budget,
      () => false,
    );
    expect(plan).toEqual({
      lodLevel: null,
      visibleTiles: [],
      prefetchTiles: [],
      byteSize: 0,
    });
  });

  it("uses exact intersection edges and keeps a distinct optional one-tile border", () => {
    const input = {
      ...viewport,
      canvasWidth: 512,
      canvasHeight: 512,
      imageWidth: 2048,
      imageHeight: 2048,
      scale: 1,
      translateX: 768,
      translateY: 768,
    };
    const plan = planTilesWithinBudget(input, budget, () => false);
    expect(
      plan.visibleTiles.map((tile) =>
        createTileKey(tile.x, tile.y, tile.lodLevel),
      ),
    ).toEqual(["0-0-2"]);
    expect(plan.prefetchTiles).toHaveLength(3);
    expect(
      planTilesWithinBudget({ ...input, translateX: 5000 }, budget, () => false)
        .lodLevel,
    ).toBeNull();
  });
});

describe("tile-scheduler", () => {
  it("calculates visible tiles sorted by viewport-center priority", () => {
    const tiles = calculateVisibleTiles({
      canvasWidth: 512,
      canvasHeight: 512,
      imageWidth: 1024,
      imageHeight: 1024,
      imageLoaded: true,
      lodLevel: 1,
      scale: 1,
      translateX: 0,
      translateY: 0,
    });

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].priority).toBeLessThanOrEqual(tiles.at(-1)!.priority);
    expect(tiles.some((tile) => tile.x === 0 && tile.y === 0)).toBe(true);
  });

  it("selects the closest half of pending tile requests within the frame limit", () => {
    const requests = new Map([
      ["1-0-1", 20],
      ["0-0-1", 10],
      ["2-0-1", 30],
      ["3-0-1", 40],
    ]);

    expect(selectPendingTileBatch(requests, 3)).toEqual([
      { key: "0-0-1", priority: 10 },
      { key: "1-0-1", priority: 20 },
    ]);
  });

  it("creates a stable rounded viewport hash", () => {
    expect(
      createViewportHash({
        scale: 1.23456,
        translateX: 10.04,
        translateY: -9.96,
      }),
    ).toBe("1.235-10.0--10.0");
  });
});
