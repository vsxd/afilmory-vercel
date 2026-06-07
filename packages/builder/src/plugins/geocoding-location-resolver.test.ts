import { describe, expect, it, vi } from "vitest";

import type { PhotoManifestItem, PickedExif } from "../types/photo.js";
import { createGeocodingCacheState } from "./geocoding-cache.js";
import { resolveLocationForItem } from "./geocoding-location-resolver.js";
import type { ResolvedGeocodingSettings } from "./geocoding-options.js";

const logger = {
  warn: vi.fn(),
  info: vi.fn(),
} as const;

function createPhoto(): PhotoManifestItem {
  return {
    id: "photo",
    title: "photo",
    description: "",
    dateTaken: "2026-06-06T00:00:00.000Z",
    tags: [],
    originalUrl: "https://example.com/photo.jpg",
    thumbnailUrl: "/thumbnails/photo.jpg",
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: "photo.jpg",
    lastModified: "2026-06-06T00:00:00.000Z",
    size: 100,
    exif: null,
    toneAnalysis: null,
    location: null,
  };
}

const gpsExif: PickedExif = {
  GPSLatitude: 41.4031,
  GPSLongitude: 2.174,
};

const settings: ResolvedGeocodingSettings = {
  cachePrecision: 4,
  locales: ["en", "zh-CN"],
  provider: "nominatim",
};

describe("geocoding location resolver", () => {
  it("resolves missing localized locations through providers and cache", async () => {
    const item = createPhoto();
    const state = createGeocodingCacheState();
    const calls: string[] = [];

    const result = await resolveLocationForItem({
      item,
      exif: gpsExif,
      state,
      settings,
      shouldOverwriteExisting: false,
      logger,
      getProvider: (locale) => ({
        reverseGeocode: vi.fn(async (latitude, longitude) => {
          calls.push(locale);
          return {
            latitude,
            longitude,
            admin: {
              country: locale === "en" ? "Spain" : "西班牙",
              countryCode: "ES",
              city: locale === "en" ? "Barcelona" : "巴塞罗那",
            },
            country: locale === "en" ? "Spain" : "西班牙",
            city: locale === "en" ? "Barcelona" : "巴塞罗那",
            locationName:
              locale === "en" ? "Barcelona, Spain" : "巴塞罗那, 西班牙",
          };
        }),
      }),
    });

    expect(result).toEqual({ attempted: true, updated: true });
    expect(calls).toEqual(["en", "zh-CN"]);
    expect(item.location).toMatchObject({
      adminKey: {
        city: "Barcelona",
        country: "Spain",
        countryCode: "ES",
      },
      adminI18n: {
        en: {
          city: "Barcelona",
          country: "Spain",
        },
        "zh-CN": {
          city: "巴塞罗那",
          country: "西班牙",
        },
      },
      locationNameI18n: {
        en: "Barcelona, Spain",
        "zh-CN": "巴塞罗那, 西班牙",
      },
    });
    expect(state.cache.size).toBe(1);
  });
});
