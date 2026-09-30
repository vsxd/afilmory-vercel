import { describe, expect, it, vi } from "vitest";

import type { PhotoManifestItem, PickedExif } from "../types/photo.js";
import { lookupLocationFromGPS } from "./geocoding-gps.js";
import {
  applyExifLocationPrivacy,
  applyManifestLocationPrivacy,
  enforcePhotoLocationPrivacy,
  reconcilePhotoLocation,
} from "./location-privacy.js";

const exactExif: PickedExif = {
  Make: "Leica",
  GPSAltitude: 123,
  GPSCoordinates: "31.230416 121.473701",
  GPSLatitude: 31.230_416,
  GPSLatitudeRef: "N",
  GPSLongitude: 121.473_701,
  GPSLongitudeRef: "E",
};

describe("location privacy policy", () => {
  it("preserves manually supplied locations when the source never had GPS", () => {
    const item = {
      exif: { Make: "Leica" },
      location: { latitude: 31.23, longitude: 121.474, city: "Shanghai" },
    };
    expect(
      reconcilePhotoLocation(item, { Make: "Leica" }, "coarse", false, false),
    ).toEqual(item.location);
    expect(
      reconcilePhotoLocation(item, { Make: "Leica" }, "strip", true, false),
    ).toBeNull();
  });

  it("strips every GPS field while preserving unrelated EXIF", () => {
    expect(applyExifLocationPrivacy(exactExif, "strip")).toEqual({
      Make: "Leica",
    });
    expect(
      applyManifestLocationPrivacy(
        { latitude: 31.230_416, longitude: 121.473_701, city: "Shanghai" },
        "strip",
      ),
    ).toBeNull();
  });

  it("coarsens coordinates before they can reach a provider or manifest", () => {
    expect(applyExifLocationPrivacy(exactExif, "coarse")).toEqual({
      Make: "Leica",
      // 海拔保留；GPSCoordinates（内嵌全精度经纬度）删除
      GPSAltitude: 123,
      GPSLatitude: 31.23,
      GPSLatitudeRef: "N",
      GPSLongitude: 121.474,
      GPSLongitudeRef: "E",
    });
    expect(
      applyManifestLocationPrivacy(
        { latitude: 31.230_416, longitude: 121.473_701, city: "Shanghai" },
        "coarse",
      ),
    ).toEqual({ latitude: 31.23, longitude: 121.474, city: "Shanghai" });
  });

  it("never includes coordinate values in geocoding logs", async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const provider = { reverseGeocode: vi.fn(async () => null) };
    await lookupLocationFromGPS(31.230_416, 121.473_701, provider, logger);
    const serializedLogs = JSON.stringify([
      ...logger.info.mock.calls,
      ...logger.warn.mock.calls,
    ]);
    expect(serializedLogs).not.toContain("31.230416");
    expect(serializedLogs).not.toContain("121.473701");
  });

  it("enforces strip mode on a preserved failure fallback before publication", () => {
    const item: PhotoManifestItem = {
      id: "photo",
      title: "",
      description: "",
      dateTaken: "2026-01-01T00:00:00.000Z",
      tags: [],
      originalUrl: "/photo.jpg",
      thumbnailUrl: "/thumb.jpg",
      thumbHash: null,
      width: 1,
      height: 1,
      aspectRatio: 1,
      s3Key: "photo.jpg",
      lastModified: "2026-01-01T00:00:00.000Z",
      size: 1,
      exif: exactExif,
      toneAnalysis: null,
      location: { latitude: 31.230_416, longitude: 121.473_701 },
    };

    enforcePhotoLocationPrivacy(item, "strip");
    expect(item.exif).toEqual({ Make: "Leica" });
    expect(item.location).toBeNull();
    expect(item.processing?.privacy).toBe("location-privacy:v1:strip");
  });

  it("does not mark a failed fallback as restored to a less restrictive mode", () => {
    const item: PhotoManifestItem = {
      id: "photo",
      title: "",
      description: "",
      dateTaken: "2026-01-01T00:00:00.000Z",
      tags: [],
      originalUrl: "/photo.jpg",
      thumbnailUrl: "/thumb.jpg",
      thumbHash: null,
      width: 1,
      height: 1,
      aspectRatio: 1,
      s3Key: "photo.jpg",
      lastModified: "2026-01-01T00:00:00.000Z",
      size: 1,
      exif: { Make: "Leica" },
      toneAnalysis: null,
      location: null,
      processing: { privacy: "location-privacy:v1:strip" },
    };

    enforcePhotoLocationPrivacy(item, "exact");
    expect(item.processing?.privacy).toBe("location-privacy:v1:strip");
    expect(item.exif).not.toHaveProperty("GPSLatitude");
  });

  // coarse 契约升级（精度/键保留规则变化 → 指纹版本变化）：取整不可逆，
  // 发布层无法凭已取整数据推导新契约。旧指纹必须保留，否则该照片被误标为
  // 已升级，增量构建永远不再重走源文件提取。
  it("keeps the old coarse fingerprint on items published under a previous coarse contract", () => {
    const item: PhotoManifestItem = {
      id: "photo",
      title: "",
      description: "",
      dateTaken: "2026-01-01T00:00:00.000Z",
      tags: [],
      originalUrl: "/photo.jpg",
      thumbnailUrl: "/thumb.jpg",
      thumbHash: null,
      width: 1,
      height: 1,
      aspectRatio: 1,
      s3Key: "photo.jpg",
      lastModified: "2026-01-01T00:00:00.000Z",
      size: 1,
      exif: {
        Make: "Leica",
        GPSLatitude: 31.23,
        GPSLatitudeRef: "N",
        GPSLongitude: 121.47,
        GPSLongitudeRef: "E",
      },
      toneAnalysis: null,
      location: { latitude: 31.23, longitude: 121.47 },
      processing: { privacy: "location-privacy:v1:coarse" },
    };

    enforcePhotoLocationPrivacy(item, "coarse");
    expect(item.processing?.privacy).toBe("location-privacy:v1:coarse");

    // 从 exact 来源可以推导任意目标：盖当前指纹
    item.processing = { privacy: "location-privacy:v1:exact" };
    enforcePhotoLocationPrivacy(item, "coarse");
    expect(item.processing?.privacy).toBe("location-privacy:v2:coarse-d3");
  });
});
