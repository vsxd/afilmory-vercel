import type { LocationAdminInfo, PhotoManifestItem } from "@afilmory/data";
import { describe, expect, it } from "vitest";

import {
  buildGeoRegionId,
  createGeographicRegions,
  photoMatchesGeoFilters,
} from "../geo-regions";
import { convertPhotosToMarkersFromEXIF } from "../map-utils";

const createPhoto = (
  id: string,
  latitude: number,
  longitude: number,
  admin?: LocationAdminInfo,
): PhotoManifestItem => ({
  id,
  title: id,
  description: "",
  tags: [],
  originalUrl: `/originals/${id}.jpg`,
  thumbnailUrl: `/thumbnails/${id}.jpg`,
  thumbHash: null,
  width: 100,
  height: 100,
  aspectRatio: 1,
  s3Key: `${id}.jpg`,
  lastModified: new Date().toISOString(),
  size: 1,
  exif: {
    GPSLatitude: latitude,
    GPSLongitude: longitude,
    MeteringMode: undefined,
    WhiteBalance: undefined,
    WBShiftAB: undefined,
    WBShiftGM: undefined,
    WhiteBalanceBias: undefined,
    FlashMeteringMode: undefined,
    SensingMethod: undefined,
    FocalPlaneXResolution: undefined,
    FocalPlaneYResolution: undefined,
    GPSAltitude: undefined,
    GPSAltitudeRef: undefined,
    GPSLatitudeRef: latitude < 0 ? "S" : "N",
    GPSLongitudeRef: longitude < 0 ? "W" : "E",
  },
  toneAnalysis: null,
  location: admin ? { latitude, longitude, admin } : null,
});

describe("createGeographicRegions", () => {
  it("groups photos by structured city admin path", () => {
    const photos = [
      createPhoto("a", 30, 120, {
        country: "China",
        countryCode: "CN",
        region: "Zhejiang",
        city: "Hangzhou",
      }),
      createPhoto("b", 30.1, 120.1, {
        country: "China",
        countryCode: "CN",
        region: "Zhejiang",
        city: "Hangzhou",
      }),
      createPhoto("c", 31, 121, {
        country: "China",
        countryCode: "CN",
        region: "Shanghai",
        city: "Shanghai",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({
      label: "Hangzhou",
      photoIds: ["a", "b"],
      photoCount: 2,
    });
    expect(regions[1]).toMatchObject({
      label: "Shanghai",
      photoIds: ["c"],
      photoCount: 1,
    });
  });

  it("keeps same-name cities separate when admin paths differ", () => {
    const photos = [
      createPhoto("a", 30, 120, {
        country: "China",
        region: "Zhejiang",
        city: "Springfield",
      }),
      createPhoto("b", 40, -89, {
        country: "United States",
        region: "Illinois",
        city: "Springfield",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(regions).toHaveLength(2);
    expect(new Set(regions.map((region) => region.id)).size).toBe(2);
  });

  it("skips photos without structured or legacy location data", () => {
    const photos = [
      createPhoto("a", 30, 120),
      createPhoto("b", 31, 121, {
        country: "China",
        city: "Shanghai",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(regions).toHaveLength(1);
    expect(regions[0].photoIds).toEqual(["b"]);
  });

  it("calculates antimeridian-crossing bounds for regions", () => {
    const photos = [
      createPhoto("a", 10, 179.99, {
        country: "Fiji",
        city: "Dateline",
      }),
      createPhoto("b", 10, -179.99, {
        country: "Fiji",
        city: "Dateline",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(regions).toHaveLength(1);
    expect(Math.abs(regions[0].longitude)).toBeGreaterThan(179.9);
    expect(regions[0].bounds.crossesAntimeridian).toBe(true);
  });
});

describe("photoMatchesGeoFilters", () => {
  it("uses OR within one level and AND across levels", () => {
    const hangzhou = {
      country: "China",
      countryCode: "CN",
      region: "Zhejiang",
      city: "Hangzhou",
    };
    const shanghai = {
      country: "China",
      countryCode: "CN",
      region: "Shanghai",
      city: "Shanghai",
    };
    const hangzhouPhoto = createPhoto("a", 30, 120, hangzhou);
    const shanghaiPhoto = createPhoto("b", 31, 121, shanghai);
    const countryId = buildGeoRegionId(hangzhou, "country")!;
    const hangzhouCityId = buildGeoRegionId(hangzhou, "city")!;
    const shanghaiCityId = buildGeoRegionId(shanghai, "city")!;

    expect(
      photoMatchesGeoFilters(hangzhouPhoto, {
        selectedGeoCountries: [countryId],
        selectedGeoRegions: [],
        selectedGeoCities: [hangzhouCityId, shanghaiCityId],
        selectedGeoDistricts: [],
      }),
    ).toBe(true);

    expect(
      photoMatchesGeoFilters(shanghaiPhoto, {
        selectedGeoCountries: [countryId],
        selectedGeoRegions: [],
        selectedGeoCities: [hangzhouCityId],
        selectedGeoDistricts: [],
      }),
    ).toBe(false);
  });
});

