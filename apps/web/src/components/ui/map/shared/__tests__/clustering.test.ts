import { describe, expect, it } from "vitest";

import type { PhotoMarker } from "~/types/map";

import { clusterMarkers } from "../clustering";

const createMarker = (
  id: string,
  longitude: number,
  latitude: number,
): PhotoMarker =>
  ({
    id,
    longitude,
    latitude,
    photo: {
      id,
      title: id,
      thumbnailUrl: "",
      originalUrl: "",
      thumbHash: null,
    },
  }) as PhotoMarker;

describe("clusterMarkers", () => {
  it("clusters nearby markers while leaving distant markers separate", () => {
    const result = clusterMarkers(
      [
        createMarker("near-a", 120, 30),
        createMarker("near-b", 120.0005, 30.0004),
        createMarker("far", 121, 31),
      ],
      14,
    );

    const cluster = result.find((point) => point.properties.cluster);

    expect(cluster?.properties.point_count).toBe(2);
    expect(result).toHaveLength(2);
  });

  it("clusters points that are close across the antimeridian", () => {
    const result = clusterMarkers(
      [createMarker("east", 179.5, 10), createMarker("west", -179.5, 10.1)],
      2,
    );

    expect(result).toHaveLength(1);
    expect(result[0].properties.cluster).toBe(true);
    expect(Math.abs(result[0].geometry.coordinates[0])).toBeCloseTo(180);
  });

  it("keeps small high-zoom marker sets unclustered for precise selection", () => {
    const result = clusterMarkers(
      [createMarker("a", 120, 30), createMarker("b", 120.0005, 30.0004)],
      15,
    );

    expect(result.every((point) => !point.properties.cluster)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("still clusters large high-zoom marker sets to avoid DOM marker explosions", () => {
    const result = clusterMarkers(
      Array.from({ length: 350 }, (_, index) =>
        createMarker(`marker-${index}`, 120 + index * 0.000001, 30),
      ),
      15,
    );

    expect(result.length).toBeLessThan(350);
    expect(result.some((point) => point.properties.cluster)).toBe(true);
  });
});
