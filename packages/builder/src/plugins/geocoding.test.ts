import { describe, expect, it } from "vitest";

import {
  composeLocalizedLocation,
  migrateV1CacheEntry,
  normalizeGeocodingLocales,
  seedCacheEntryFromExistingLocation,
} from "./geocoding.js";

describe("geocodingPlugin helpers", () => {
  it("normalizes configured locales and always includes English first", () => {
    expect(normalizeGeocodingLocales()).toEqual(["en", "zh-CN"]);
    expect(normalizeGeocodingLocales("zh-CN,ko")).toEqual([
      "en",
      "zh-CN",
      "ko",
    ]);
    expect(normalizeGeocodingLocales("", "zh-CN")).toEqual(["en", "zh-CN"]);
  });

  it("migrates legacy cache keys into locale buckets", () => {
    const migrated = migrateV1CacheEntry("nominatim||zh-CN|41.4031|2.1740", {
      latitude: 41.4031,
      longitude: 2.174,
      admin: {
        country: "西班牙",
        countryCode: "ES",
        region: "加泰罗尼亚",
      },
    });

    expect(migrated).toEqual({
      key: "nominatim||4|41.4031|2.1740",
      locale: "zh-CN",
      location: {
        latitude: 41.4031,
        longitude: 2.174,
        admin: {
          country: "西班牙",
          countryCode: "ES",
          region: "加泰罗尼亚",
        },
      },
    });
  });

  it("composes manifest location data with localized admin and stable canonical key", () => {
    const location = composeLocalizedLocation(41.4031, 2.174, {
      locales: {
        en: {
          latitude: 41.4031,
          longitude: 2.174,
          admin: {
            country: "Spain",
            countryCode: "ES",
            region: "Catalonia",
            city: "Barcelona",
          },
          country: "Spain",
          city: "Barcelona",
          locationName: "Barcelona, Catalonia, Spain",
        },
        "zh-CN": {
          latitude: 41.4031,
          longitude: 2.174,
          admin: {
            country: "西班牙",
            countryCode: "ES",
            region: "加泰罗尼亚",
            city: "巴塞罗那",
          },
          country: "西班牙",
          city: "巴塞罗那",
          locationName: "巴塞罗那, 加泰罗尼亚, 西班牙",
        },
      },
    });

    expect(location).toMatchObject({
      latitude: 41.4031,
      longitude: 2.174,
      country: "Spain",
      city: "Barcelona",
      admin: {
        country: "Spain",
        countryCode: "ES",
        region: "Catalonia",
        city: "Barcelona",
      },
      adminKey: {
        country: "Spain",
        countryCode: "ES",
        region: "Catalonia",
        city: "Barcelona",
      },
      adminI18n: {
        en: {
          country: "Spain",
          countryCode: "ES",
          region: "Catalonia",
          city: "Barcelona",
        },
        "zh-CN": {
          country: "西班牙",
          countryCode: "ES",
          region: "加泰罗尼亚",
          city: "巴塞罗那",
        },
      },
      locationNameI18n: {
        en: "Barcelona, Catalonia, Spain",
        "zh-CN": "巴塞罗那, 加泰罗尼亚, 西班牙",
      },
    });
  });

  it("seeds cache entries from partial v10 manifest location data", () => {
    const entry = { locales: {} };
    const englishAdmin = {
      country: "Spain",
      countryCode: "ES",
      region: "Catalonia",
      city: "Barcelona",
    };
    const chineseAdmin = {
      country: "西班牙",
      countryCode: "ES",
      region: "加泰罗尼亚",
      city: "巴塞罗那",
    };

    const changed = seedCacheEntryFromExistingLocation(
      entry,
      {
        latitude: 41.4031,
        longitude: 2.174,
        adminKey: englishAdmin,
        adminI18n: {
          "zh-CN": chineseAdmin,
        },
        locationNameI18n: {
          "zh-CN": "巴塞罗那, 加泰罗尼亚, 西班牙",
        },
      },
      41.4031,
      2.174,
    );

    expect(changed).toBe(true);
    expect(entry.locales).toMatchObject({
      en: {
        admin: englishAdmin,
      },
      "zh-CN": {
        admin: chineseAdmin,
        locationName: "巴塞罗那, 加泰罗尼亚, 西班牙",
      },
    });
  });
});
