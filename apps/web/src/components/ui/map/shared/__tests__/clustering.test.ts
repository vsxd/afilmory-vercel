import { describe, expect, it } from "vitest";

import type { GeographicRegion, PhotoMarker } from "~/types/map";

import { clusterMarkers, clusterRegions } from "../clustering";

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

const createRegion = (
  id: string,
  longitude: number,
  latitude: number,
): GeographicRegion => {
  const marker = createMarker(id, longitude, latitude);

  return {
    id,
    level: "city",
    label: id,
    adminPath: { city: id },
    longitude,
    latitude,
    photoIds: [id],
    photoCount: 1,
    representativeMarker: marker,
    markers: [marker],
    bounds: {
      minLat: latitude,
      maxLat: latitude,
      minLng: longitude,
      maxLng: longitude,
      centerLat: latitude,
      centerLng: longitude,
      longitudeSpan: 0,
      crossesAntimeridian: false,
      bounds: [
        [longitude, latitude],
        [longitude, latitude],
      ],
    },
  };
};

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

  it("clusters regions for visual map display", () => {
    const regions = [
      createRegion("region-a", 120, 30),
      createRegion("region-b", 120.002, 30),
      createRegion("region-c", 121, 31),
    ];
    const result = clusterRegions(regions, 10);
    const cluster = result.find(isClusterPoint);

    expect(regions).toHaveLength(3);
    expect(cluster?.properties.point_count).toBe(2);
    expect(cluster?.properties.clusteredRegions).toHaveLength(2);
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
