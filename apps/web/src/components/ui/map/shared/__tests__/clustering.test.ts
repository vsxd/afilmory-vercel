import { describe, expect, it, vi } from "vitest";

import type { GeographicRegion, PhotoMarker } from "~/types/map";

import {
  createMarkerClusterIndex,
  createRegionClusterIndex,
  getClusterPhotos,
  getClusterPoints,
} from "../clustering";
import type { ClusterPoint } from "../types";

const WORLD_BOUNDS: [number, number, number, number] = [-180, -90, 180, 90];

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
  point: ClusterPoint,
): point is ClusterPoint & {
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
    const result = getClusterPoints(
      createMarkerClusterIndex([
        createMarker("near-a", 120, 30),
        createMarker("near-b", 120.0005, 30.0004),
        createMarker("far", 121, 31),
      ]),
      10,
      WORLD_BOUNDS,
    );

    const cluster = result.find(isClusterPoint);

    expect(cluster?.properties.point_count).toBe(2);
    expect(cluster?.properties.previewPhotos).toHaveLength(2);
    expect(result).toHaveLength(2);
  });

  it("clusters regions for visual map display", () => {
    const regions = [
      createRegion("region-a", 120, 30),
      createRegion("region-b", 120.002, 30),
      createRegion("region-c", 121, 31),
    ];
    const result = getClusterPoints(
      createRegionClusterIndex(regions),
      10,
      WORLD_BOUNDS,
    );
    const cluster = result.find(isClusterPoint);

    expect(regions).toHaveLength(3);
    expect(cluster?.properties.point_count).toBe(2);
    expect(cluster?.properties.previewPhotos).toHaveLength(2);
  });

  it("expands close photos into single points past the configured max zoom", () => {
    const result = getClusterPoints(
      createMarkerClusterIndex([
        createMarker("a", 120, 30),
        createMarker("b", 120.0005, 30.0004),
      ]),
      17,
      WORLD_BOUNDS,
    );

    expect(result.every((point) => !isClusterPoint(point))).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("answers every zoom level from a single index", () => {
    const markers = [
      createMarker("near-a", 120, 30),
      createMarker("near-b", 120.0005, 30.0004),
      createMarker("far", 121, 31),
    ];
    const index = createMarkerClusterIndex(markers);

    const zoomedOut = getClusterPoints(index, 10, WORLD_BOUNDS);
    const zoomedIn = getClusterPoints(index, 17, WORLD_BOUNDS);

    expect(zoomedOut.find(isClusterPoint)?.properties.point_count).toBe(2);
    expect(zoomedIn.every((point) => !isClusterPoint(point))).toBe(true);
    expect(zoomedIn).toHaveLength(3);
  });

  it("keeps four previews without reading leaves, and expands photos only on demand", () => {
    const markers = Array.from({ length: 8 }, (_, i) =>
      createMarker(`near-${i}`, 120 + i * 0.00001, 30),
    );
    const index = createMarkerClusterIndex(markers)!;
    const getLeaves = vi.spyOn(index, "getLeaves");
    const cluster = getClusterPoints(index, 10, [119, 29, 121, 31]).find(
      isClusterPoint,
    )!;
    expect(cluster.properties.point_count).toBe(8);
    expect(cluster.properties.previewPhotos).toHaveLength(4);
    expect(getLeaves).not.toHaveBeenCalled();

    const photos = getClusterPhotos(index, cluster.properties.cluster_id!);
    expect(photos.map((marker) => marker.id).sort()).toEqual(
      markers.map((marker) => marker.id).sort(),
    );
    expect(getLeaves).toHaveBeenCalledTimes(1);
    getLeaves.mockRestore();
  });

  it("expands all photos from region leaves only when requested", () => {
    const regionA = createRegion("a", 120, 30);
    const extra = createMarker("extra", 120, 30);
    regionA.markers.push(extra);
    regionA.photoIds.push(extra.id);
    regionA.photoCount = 2;
    const regionB = createRegion("b", 120.002, 30);
    const index = createRegionClusterIndex([regionA, regionB])!;
    const getLeaves = vi.spyOn(index, "getLeaves");
    const cluster = getClusterPoints(index, 10, WORLD_BOUNDS).find(
      isClusterPoint,
    )!;
    expect(cluster.properties.point_count).toBe(2);
    expect(cluster.properties.previewPhotos).toHaveLength(3);
    expect(getLeaves).not.toHaveBeenCalled();
    expect(
      getClusterPhotos(index, cluster.properties.cluster_id!)
        .map((marker) => marker.id)
        .sort(),
    ).toEqual(["a", "b", "extra"]);
    getLeaves.mockRestore();
  });

  it("queries only the viewport, including antimeridian and repeated world views", () => {
    const index = createMarkerClusterIndex([
      createMarker("east", 179, 10),
      createMarker("west", -179, 10),
      createMarker("middle", 0, 10),
      createMarker("outside-latitude", 179, -40),
    ]);
    const idsIn = (bounds: [number, number, number, number]) =>
      getClusterPoints(index, 17, bounds)
        .map((point) => point.properties.marker?.id)
        .sort();
    expect(idsIn([170, 0, 190, 20])).toEqual(["east", "west"]);
    expect(idsIn([170, 0, -170, 20])).toEqual(["east", "west"]);
    expect(idsIn([530, 0, 550, 20])).toEqual(["east", "west"]);
    expect(idsIn([-190, 0, -170, 20])).toEqual(["east", "west"]);
    expect(idsIn([-540, 0, 540, 20])).toEqual(["east", "middle", "west"]);
    expect(idsIn([-10, 0, 10, 20])).toEqual(["middle"]);
  });

  it("clusters globally before clipping the query, preserving cluster counts near viewport edges", () => {
    const index = createMarkerClusterIndex([
      createMarker("a", 120, 30),
      createMarker("b", 120.0005, 30),
      createMarker("far", -120, 30),
    ]);
    const cluster = getClusterPoints(index, 10, [119, 29, 120.0003, 31]).find(
      isClusterPoint,
    )!;
    expect(cluster.properties.point_count).toBe(2);
    expect(
      getClusterPhotos(index, cluster.properties.cluster_id!)
        .map((marker) => marker.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("returns an empty result for empty inputs", () => {
    expect(createMarkerClusterIndex([])).toBeNull();
    expect(createRegionClusterIndex([])).toBeNull();
    expect(getClusterPoints(null, 10, WORLD_BOUNDS)).toEqual([]);
  });
});
