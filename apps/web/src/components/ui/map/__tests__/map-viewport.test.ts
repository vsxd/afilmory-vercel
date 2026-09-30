import { describe, expect, it } from "vitest";

import { updateMapClusterViewport } from "../map-viewport";

describe("map cluster viewport", () => {
  it("buffers the viewport and reuses it for small pans and fractional zoom", () => {
    const initial = updateMapClusterViewport(null, [100, 20, 120, 40], 8)!;
    expect(initial).toEqual({ bounds: [95, 15, 125, 45], zoom: 8 });
    expect(updateMapClusterViewport(initial, [101, 21, 121, 41], 8.4)).toBe(
      initial,
    );
    expect(updateMapClusterViewport(initial, [106, 21, 126, 41], 8.4)).not.toBe(
      initial,
    );
    expect(updateMapClusterViewport(initial, [101, 21, 121, 41], 9)).toEqual({
      bounds: [96, 16, 126, 46],
      zoom: 9,
    });
  });

  it("retains equivalent world copies and unrolls antimeridian crossings", () => {
    const initial = updateMapClusterViewport(null, [170, 0, -170, 20], 8)!;
    expect(initial.bounds).toEqual([165, -5, 195, 25]);
    expect(updateMapClusterViewport(initial, [-190, 0, -170, 20], 8)).toBe(
      initial,
    );
    expect(updateMapClusterViewport(initial, [530, 0, 550, 20], 8)).toBe(
      initial,
    );
    expect(updateMapClusterViewport(initial, [200, 0, 220, 20], 8)).not.toBe(
      initial,
    );
  });

  it("clips latitude and allows viewports spanning the world without duplicate queries", () => {
    const initial = updateMapClusterViewport(null, [-200, -85, 200, 85], 1)!;
    expect(initial.bounds).toEqual([-300, -90, 300, 90]);
    expect(updateMapClusterViewport(initial, [160, -85, 560, 85], 1)).toBe(
      initial,
    );
    expect(
      updateMapClusterViewport(initial, [170, 0, 190, 20], 2)?.bounds,
    ).toEqual([165, -5, 195, 25]);
  });

  it("shrinks the query when zooming beyond the last cluster level", () => {
    const initial = updateMapClusterViewport(null, [100, 20, 120, 40], 17)!;
    expect(updateMapClusterViewport(initial, [109, 29, 111, 31], 20)).toEqual({
      bounds: [108.5, 28.5, 111.5, 31.5],
      zoom: 20,
    });
  });

  it("retains the last valid viewport when the map has no finite bounds", () => {
    const initial = updateMapClusterViewport(null, [100, 20, 120, 40], 8);
    expect(
      updateMapClusterViewport(initial, [Number.NaN, 20, 120, 40], 8),
    ).toBe(initial);
    expect(
      updateMapClusterViewport(null, [100, 20, 120, 40], Number.NaN),
    ).toBeNull();
  });
});
