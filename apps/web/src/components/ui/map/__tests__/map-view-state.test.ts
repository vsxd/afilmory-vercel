import { describe, expect, it } from "vitest";

import {
  calculateFallbackZoomLevel,
  createClusterZoomViewState,
  createFallbackBoundsViewState,
} from "../map-view-state";

describe("map view-state helpers", () => {
  it("maps geographic spans to fallback zoom levels", () => {
    expect(calculateFallbackZoomLevel(0.0005, 0.0005)).toBe(16);
    expect(calculateFallbackZoomLevel(0.5, 0.5)).toBe(8);
    expect(calculateFallbackZoomLevel(20, 20)).toBe(2);
  });

  it("creates fallback view state from bounds", () => {
    expect(
      createFallbackBoundsViewState({
        centerLng: 120,
        centerLat: 30,
        minLat: 29,
        maxLat: 31,
        longitudeSpan: 2,
      }),
    ).toEqual({
      longitude: 120,
      latitude: 30,
      zoom: 4,
    });
  });

  it("zooms cluster fallback without exceeding max zoom", () => {
    expect(
      createClusterZoomViewState({
        currentViewState: { longitude: 0, latitude: 0, zoom: 17 },
        longitude: 121.5,
        latitude: 31.2,
      }),
    ).toEqual({
      longitude: 121.5,
      latitude: 31.2,
      zoom: 18,
    });
  });
});
