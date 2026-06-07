import { describe, expect, it } from "vitest";

import type { LocationAdminInfo, PhotoManifestItem } from "../index";
import {
  buildGeoRegionId,
  getLanguageCandidates,
  getPhotoAdminForLevel,
  getPhotoRegionIds,
  getRegionAdminPath,
  normalizeLocationInfoAdminAliases,
  photoMatchesGeoFilters,
} from "../index";

const createPhoto = (
  id: string,
  admin?: LocationAdminInfo,
  locationOverrides?: Partial<NonNullable<PhotoManifestItem["location"]>>,
): PhotoManifestItem => ({
  id,
  title: id,
  description: "",
  dateTaken: "2026-06-06T00:00:00.000Z",
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
  exif: null,
  toneAnalysis: null,
  location:
    admin || locationOverrides
      ? { latitude: 30, longitude: 120, admin, ...locationOverrides }
      : null,
});

describe("geo domain helpers", () => {
  it("builds locale fallback candidates", () => {
    expect(getLanguageCandidates("zh-HK")).toEqual([
      "zh-HK",
      "zh",
      "zh-CN",
      "en",
    ]);
    expect(getLanguageCandidates("ja-JP")).toEqual(["ja-JP", "ja", "jp", "en"]);
  });

  it("normalizes semicolon aliases according to Chinese script preference", () => {
    const location = normalizeLocationInfoAdminAliases(
      {
        latitude: 51.51,
        longitude: -0.08,
        admin: {
          country: "英国;英國",
          countryCode: "gb",
          region: "英格兰;英格蘭",
          city: "倫敦市;伦敦市",
        },
      },
      "zh-HK",
    );

    expect(location.admin).toMatchObject({
      country: "英國",
      countryCode: "GB",
      region: "英格蘭",
      city: "倫敦市",
    });
  });

  it("builds stable region ids and admin paths from canonical admin data", () => {
    const admin = {
      country: "Spain",
      countryCode: "ES",
      region: "Catalonia",
      city: "Barcelona",
    };

    expect(buildGeoRegionId(admin, "region")).toBe(
      "region:country=es|region=catalonia",
    );
    expect(getRegionAdminPath(admin, "city")).toEqual({
      country: "Spain",
      countryCode: "ES",
      region: "Catalonia",
      city: "Barcelona",
    });
  });

  it("rolls China municipality districts up to the city level", () => {
    const photo = createPhoto("chongqing", {
      country: "China",
      countryCode: "CN",
      region: "Chongqing",
      city: "Nan'an District",
      district: "Haitangxi",
    });

    expect(getPhotoAdminForLevel(photo, "city")).toMatchObject({
      city: "Chongqing",
    });
    expect(getPhotoRegionIds(photo).city).toBe(
      "city:country=cn|region=chongqing|city=chongqing",
    );
  });

  it("rolls China district-like city fields up from localized full address", () => {
    const englishAdmin: LocationAdminInfo = {
      country: "China",
      countryCode: "CN",
      region: "Anhui",
      city: "Shushan District",
      district: "Hefei High-Tech Industrial Development Zone",
    };
    const chineseAdmin: LocationAdminInfo = {
      country: "中国",
      countryCode: "CN",
      region: "安徽省",
      city: "蜀山区",
      district: "合肥高新技术产业开发区",
    };
    const photo = createPhoto("hefei", englishAdmin, {
      admin: englishAdmin,
      adminKey: englishAdmin,
      adminI18n: {
        en: englishAdmin,
        "zh-CN": chineseAdmin,
      },
      locationName: "Road, Shushan District, Hefei, Anhui, China",
      locationNameI18n: {
        en: "Road, Shushan District, Hefei, Anhui, China",
        "zh-CN": "道路, 蜀山区, 合肥市, 安徽省, 中国",
      },
    });

    expect(getPhotoAdminForLevel(photo, "city")).toMatchObject({
      city: "Hefei",
    });
    expect(getPhotoAdminForLevel(photo, "city", "zh-CN")).toMatchObject({
      city: "合肥市",
    });
  });

  it("matches selected geo filters with OR within a level and AND across levels", () => {
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
    const hangzhouPhoto = createPhoto("hangzhou", hangzhou);
    const shanghaiPhoto = createPhoto("shanghai", shanghai);
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
