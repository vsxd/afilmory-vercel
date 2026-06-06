import type { LocationAdminInfo, PhotoManifestItem } from "@afilmory/schema";
import { buildGeoRegionId, photoMatchesGeoFilters } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { createGeographicRegions, getRegionDisplayName } from "../geo-regions";
import { convertPhotosToMarkersFromEXIF } from "../map-utils";

const createPhoto = (
  id: string,
  latitude: number,
  longitude: number,
  admin?: LocationAdminInfo,
  locationOverrides?: Partial<NonNullable<PhotoManifestItem["location"]>>,
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
  location:
    admin || locationOverrides
      ? { latitude, longitude, admin, ...locationOverrides }
      : null,
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

  it("rolls China municipality districts up to the municipality city level", () => {
    const photos = [
      createPhoto("a", 29.56, 106.59, {
        country: "China",
        countryCode: "CN",
        region: "Chongqing",
        city: "Nan'an District",
        district: "Haitangxi",
      }),
      createPhoto("b", 29.57, 106.58, {
        country: "China",
        countryCode: "CN",
        region: "Chongqing",
        city: "Yuzhong District",
        district: "Chaotianmen",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      id: "city:country=cn|region=chongqing|city=chongqing",
      label: "Chongqing",
      photoIds: ["a", "b"],
    });
    expect(getRegionDisplayName(regions[0], "en")).toBe("China / Chongqing");
  });

  it("rolls district-like China city fields up to the city from the full address", () => {
    const hefeiAdmin: LocationAdminInfo = {
      country: "China",
      countryCode: "CN",
      region: "Anhui",
      city: "Shushan District",
      district: "Hefei High-Tech Industrial Development Zone",
    };
    const baoheAdmin: LocationAdminInfo = {
      country: "China",
      countryCode: "CN",
      region: "Anhui",
      city: "Baohe District",
      district: "Changqing Subdistrict",
    };
    const hefeiAdminZh: LocationAdminInfo = {
      country: "中国",
      countryCode: "CN",
      region: "安徽省",
      city: "蜀山区",
      district: "合肥高新技术产业开发区",
    };

    const photos = [
      createPhoto("a", 31.84, 117.16, hefeiAdmin, {
        admin: hefeiAdmin,
        adminKey: hefeiAdmin,
        adminI18n: {
          en: hefeiAdmin,
          "zh-CN": hefeiAdminZh,
        },
        locationName: "Road, Shushan District, Hefei, Anhui, 230088, China",
        locationNameI18n: {
          en: "Road, Shushan District, Hefei, Anhui, 230088, China",
          "zh-CN": "道路, 蜀山区, 合肥市, 安徽省, 230088, 中国",
        },
      }),
      createPhoto("b", 31.85, 117.17, baoheAdmin, {
        locationName:
          "Road, Changqing Subdistrict, Baohe District, Hefei, Anhui, China",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(regions).toHaveLength(1);
    expect(regions[0].id).toBe("city:country=cn|region=anhui|city=hefei");
    expect(getRegionDisplayName(regions[0], "en")).toBe(
      "China / Anhui / Hefei",
    );
    expect(getRegionDisplayName(regions[0], "zh-CN")).toBe(
      "中国 / 安徽省 / 合肥市",
    );
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

  it("collapses Nominatim simplified and traditional aliases for display", () => {
    const photos = [
      createPhoto("a", 51.51, -0.08, {
        country: "英国;英國",
        countryCode: "GB",
        region: "英格兰;英格蘭",
        city: "倫敦市;伦敦市",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "city",
    );

    expect(getRegionDisplayName(regions[0], "zh-CN")).toBe(
      "英国 / 英格兰 / 伦敦市",
    );
    expect(getRegionDisplayName(regions[0], "zh-HK")).toBe(
      "英國 / 英格蘭 / 倫敦市",
    );
  });

  it("keeps region ids language-independent while localizing display names", () => {
    const englishAdmin: LocationAdminInfo = {
      country: "Spain",
      countryCode: "ES",
      region: "Catalonia",
      city: "Barcelona",
    };
    const chineseAdmin: LocationAdminInfo = {
      country: "西班牙",
      countryCode: "ES",
      region: "加泰罗尼亚",
      city: "巴塞罗那",
    };

    const photos = [
      createPhoto("a", 41.4031, 2.174, englishAdmin, {
        admin: englishAdmin,
        adminKey: englishAdmin,
        adminI18n: {
          en: englishAdmin,
          "zh-CN": chineseAdmin,
        },
        country: "Spain",
        city: "Barcelona",
      }),
    ];

    const regions = createGeographicRegions(
      convertPhotosToMarkersFromEXIF(photos),
      "region",
    );

    expect(regions).toHaveLength(1);
    expect(regions[0].id).toBe("region:country=es|region=catalonia");
    expect(getRegionDisplayName(regions[0], "en")).toBe("Spain / Catalonia");
    expect(getRegionDisplayName(regions[0], "zh-CN")).toBe(
      "西班牙 / 加泰罗尼亚",
    );
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
