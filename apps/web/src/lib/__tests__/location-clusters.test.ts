import type { PhotoManifestItem, PickedExif } from "@afilmory/data";
import { describe, expect, it } from "vitest";

import type { PhotoMarker } from "~/types/map";

import {
  createShootingLocations,
  getHaversineDistanceMeters,
} from "../location-clusters";
import { convertPhotosToMarkersFromEXIF } from "../map-utils";

const createPhoto = (
  id: string,
  exif: PickedExif | null = null,
): PhotoManifestItem => ({
  id,
  title: id,
  dateTaken: "2024-01-01",
  tags: [],
  description: "",
  originalUrl: `/photos/${id}.jpg`,
  thumbnailUrl: `/thumbs/${id}.jpg`,
  thumbHash: null,
  width: 4000,
  height: 3000,
  aspectRatio: 4 / 3,
  s3Key: `${id}.jpg`,
  lastModified: "2024-01-01T00:00:00Z",
  size: 1024,
  exif,
  toneAnalysis: null,
  location: null,
});

const createMarker = (
  id: string,
  latitude: number,
  longitude: number,
): PhotoMarker => ({
  id,
  latitude,
  longitude,
  photo: createPhoto(id),
});

describe("createShootingLocations", () => {
  it("merges photos within 100 meters and separates photos outside the radius", () => {
    const nearA = createMarker("near-a", 30, 120);
    const nearB = createMarker("near-b", 30.0005, 120);
    const far = createMarker("far", 30.002, 120);

    expect(getHaversineDistanceMeters(nearA, nearB)).toBeLessThan(100);
    expect(getHaversineDistanceMeters(nearA, far)).toBeGreaterThan(100);

    const locations = createShootingLocations([nearA, nearB, far]);

    expect(locations).toHaveLength(2);
    expect(locations[0]).toMatchObject({
      id: "location-near-a",
      photoIds: ["near-a", "near-b"],
      photoCount: 2,
      representativeMarker: nearA,
    });
    expect(locations[1]).toMatchObject({
      id: "location-far",
      photoIds: ["far"],
      photoCount: 1,
    });
  });

  it("uses connected clustering so chained nearby points remain one location", () => {
    const locations = createShootingLocations([
      createMarker("a", 30, 120),
      createMarker("b", 30.0008, 120),
      createMarker("c", 30.0016, 120),
    ]);

    expect(locations).toHaveLength(1);
    expect(locations[0].photoIds).toEqual(["a", "b", "c"]);
  });

  it("keeps invalid or missing GPS photos out before location clustering", () => {
    const markers = convertPhotosToMarkersFromEXIF([
      createPhoto("valid", {
        GPSLatitude: 30,
        GPSLatitudeRef: "N",
        GPSLongitude: 120,
        GPSLongitudeRef: "E",
      } as PickedExif),
      createPhoto("missing"),
      createPhoto("invalid", {
        GPSLatitude: 91,
        GPSLatitudeRef: "N",
        GPSLongitude: 120,
        GPSLongitudeRef: "E",
      } as PickedExif),
    ]);

    expect(markers.map((marker) => marker.id)).toEqual(["valid"]);
    expect(createShootingLocations(markers)).toHaveLength(1);
  });

  it("calculates a stable center across the 180 degree antimeridian", () => {
    const locations = createShootingLocations([
      createMarker("east", 10, 179.9997),
      createMarker("west", 10, -179.9997),
    ]);

    expect(locations).toHaveLength(1);
    expect(Math.abs(locations[0].longitude)).toBeGreaterThan(179.99);
    expect(locations[0].bounds.crossesAntimeridian).toBe(true);
  });

  it("can produce a location count that differs from the GPS photo count", () => {
    const markers = [
      createMarker("same-place-a", 30, 120),
      createMarker("same-place-b", 30.0004, 120),
      createMarker("other-place", 31, 121),
    ];

    const locations = createShootingLocations(markers);

    expect(markers).toHaveLength(3);
    expect(locations).toHaveLength(2);
  });
});
