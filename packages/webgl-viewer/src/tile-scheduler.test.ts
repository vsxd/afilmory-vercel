import { describe, expect, it } from "vitest";

import {
  calculateVisibleTiles,
  createViewportHash,
  selectPendingTileBatch,
} from "./tile-scheduler";

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
