import { describe, expect, it } from "vitest";

import { createShootingLocations } from "~/lib/location-clusters";
import type { PhotoMarker } from "~/types/map";

import { clusterLocations, clusterMarkers } from "../clustering";

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

const isClusterPoint = (
  point: ReturnType<typeof clusterMarkers>[number],
): point is ReturnType<typeof clusterMarkers>[number] & {
  properties: { cluster: true };
} => "cluster" in point.properties && point.properties.cluster === true;

describe("map visual clustering", () => {
  it("clusters photo markers with supercluster", () => {
    const result = clusterMarkers(
      [
        createMarker("near-a", 120, 30),
        createMarker("near-b", 120.0005, 30.0004),
        createMarker("far", 121, 31),
      ],
      10,
    );

    const cluster = result.find(isClusterPoint);

    expect(cluster?.properties.point_count).toBe(2);
    expect(cluster?.properties.clusteredPhotos).toHaveLength(2);
    expect(result).toHaveLength(2);
  });

  it("clusters shooting locations separately from true location stats", () => {
    const locations = createShootingLocations([
      createMarker("location-a", 120, 30),
      createMarker("location-b", 120.002, 30),
      createMarker("location-c", 121, 31),
    ]);
    const result = clusterLocations(locations, 10);
    const cluster = result.find(isClusterPoint);

    expect(locations).toHaveLength(3);
    expect(cluster?.properties.point_count).toBe(2);
    expect(cluster?.properties.clusteredLocations).toHaveLength(2);
    expect(cluster?.properties.clusteredPhotos).toHaveLength(2);
  });

  it("expands close photos into single points past the configured max zoom", () => {
    const result = clusterMarkers(
      [createMarker("a", 120, 30), createMarker("b", 120.0005, 30.0004)],
      17,
    );

    expect(result.every((point) => !isClusterPoint(point))).toBe(true);
    expect(result).toHaveLength(2);
  });
});
