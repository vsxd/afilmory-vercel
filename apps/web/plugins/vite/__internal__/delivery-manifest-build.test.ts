import { createManifest } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { parseWebDeliveryManifest } from "../../../src/data-runtime/delivery-manifest";
import { createWebDeliveryArtifacts } from "./delivery-manifest-build";

const createPhoto = (id: string) => ({
  id,
  title: id,
  description: "",
  dateTaken: "2026-01-01T00:00:00.000Z",
  tags: [],
  originalUrl: `/originals/${id}.jpg`,
  thumbnailUrl: `/thumbnails/${id}.jpg`,
  thumbHash: null,
  width: 1200,
  height: 800,
  aspectRatio: 1.5,
  s3Key: `${id}.jpg`,
  lastModified: "2026-01-01T00:00:00.000Z",
  size: 100,
  exif: {
    Make: "Camera",
    Model: "Model",
    ISO: 200,
    Artist: "detail-only",
    GPSAltitude: 12,
    GPSCoordinates: "31.234567, 121.567891",
    GPSLatitude: 31.234567,
    GPSLongitude: 121.567891,
  },
  toneAnalysis: {
    toneType: "normal" as const,
    brightness: 50,
    contrast: 20,
    shadowRatio: 0.1,
    highlightRatio: 0.2,
  },
  location: {
    latitude: 31.234567,
    longitude: 121.567891,
    city: "Shanghai",
    adminI18n: {
      en: { country: "China", city: "Shanghai" },
      "zh-CN": { country: "中国", city: "上海" },
    },
    locationNameI18n: { en: "Shanghai", "zh-CN": "上海" },
  },
});

describe("createWebDeliveryArtifacts", () => {
  it("publishes display variants in the initial gallery index without a detail fetch", () => {
    const displayImages = [
      { url: "/thumbnails/a.display.jpg", width: 960, height: 640 },
    ];
    const result = createWebDeliveryArtifacts(
      createManifest({ photos: [{ ...createPhoto("a"), displayImages }] }),
    );
    const index = result.assets.find(
      (asset) => asset.fileName === result.indexFileName,
    )!;
    expect(
      parseWebDeliveryManifest(JSON.parse(index.source))?.manifest.photos[0]
        .displayImages,
    ).toEqual(displayImages);
  });
  it("emits a lightweight valid gallery index and bounded detail shards", () => {
    const manifest = createManifest({
      photos: [createPhoto("a"), createPhoto("b"), createPhoto("c")],
    });
    const result = createWebDeliveryArtifacts(manifest, 2);
    const indexAsset = result.assets.find(
      (asset) => asset.fileName === result.indexFileName,
    );
    expect(indexAsset).toBeDefined();

    const parsed = parseWebDeliveryManifest(JSON.parse(indexAsset!.source));
    expect(parsed?.manifest.photos).toHaveLength(3);
    expect(
      parsed?.delivery.detailShards
        .flatMap((shard) => shard.photoIds)
        .toSorted(),
    ).toEqual(["a", "b", "c"]);
    expect(
      parsed?.delivery.detailShards.every(
        (shard) => shard.photoIds.length <= 2,
      ),
    ).toBe(true);
    expect(parsed?.manifest.photos[0]?.exif).toMatchObject({
      Make: "Camera",
      Model: "Model",
      ISO: 200,
    });
    expect(parsed?.manifest.photos[0]?.exif).not.toHaveProperty("Artist");
    expect(parsed?.manifest.photos[0]?.toneAnalysis).toBeNull();
    expect(parsed?.manifest.photos[0]?.location).toMatchObject({
      adminI18n: { "zh-CN": { country: "中国", city: "上海" } },
      locationNameI18n: { "zh-CN": "上海" },
    });
    expect(result.indexBytes).toBeLessThan(result.fullManifestBytes);
  });

  it("uses content-addressed immutable asset names", () => {
    const manifest = createManifest({ photos: [createPhoto("a")] });
    const first = createWebDeliveryArtifacts(manifest);
    const second = createWebDeliveryArtifacts(manifest);
    expect(first.assets).toEqual(second.assets);
    expect(first.indexFileName).toMatch(
      /^assets\/gallery-index\.[\da-f]{10}\.json$/,
    );
  });

  it("keeps unrelated detail shards immutable when a new photo is inserted", () => {
    const existingPhotos = Array.from({ length: 65 }, (_, index) =>
      createPhoto(`existing-${index.toString().padStart(3, "0")}`),
    );
    const before = createWebDeliveryArtifacts(
      createManifest({ photos: existingPhotos }),
      8,
    );
    const after = createWebDeliveryArtifacts(
      createManifest({ photos: [createPhoto("newest"), ...existingPhotos] }),
      8,
    );
    const readIndex = (artifacts: typeof before) =>
      parseWebDeliveryManifest(
        JSON.parse(
          artifacts.assets.find(
            (asset) => asset.fileName === artifacts.indexFileName,
          )!.source,
        ),
      )!;
    const beforeUrls = new Set(
      readIndex(before).delivery.detailShards.map((shard) => shard.url),
    );
    const preservedUrls = readIndex(after).delivery.detailShards.filter(
      (shard) => beforeUrls.has(shard.url),
    );

    expect(preservedUrls.length).toBeGreaterThanOrEqual(beforeUrls.size - 1);
  });

  it("keeps stable shards densely populated at gallery scale", () => {
    const result = createWebDeliveryArtifacts(
      createManifest({
        photos: Array.from({ length: 1_000 }, (_, index) =>
          createPhoto(`library-${index.toString().padStart(4, "0")}`),
        ),
      }),
    );
    const index = parseWebDeliveryManifest(
      JSON.parse(
        result.assets.find((asset) => asset.fileName === result.indexFileName)!
          .source,
      ),
    )!;

    expect(index.delivery.detailShards.length).toBeGreaterThanOrEqual(32);
    expect(index.delivery.detailShards.length).toBeLessThanOrEqual(64);
    expect(
      index.delivery.detailShards.every((shard) => shard.photoIds.length <= 32),
    ).toBe(true);
  });

  it("enforces coarse privacy for legacy manifests at the web publication boundary", () => {
    const sourcePhoto = createPhoto("legacy");
    const manifest = createManifest({ photos: [sourcePhoto] });
    const result = createWebDeliveryArtifacts(manifest);
    const parsedAssets = result.assets.map((asset) => JSON.parse(asset.source));
    const index = parsedAssets.find((asset) => asset.kind === "gallery-index");
    const detail = parsedAssets.find((asset) => asset.kind === "photo-details");
    const map = parsedAssets.find((asset) => asset.kind === "map-details");

    expect(index.manifest.photos[0]).toMatchObject({
      location: { latitude: 31.235, longitude: 121.568 },
      processing: { privacy: "location-privacy:v2:coarse-d3" },
    });
    expect(detail.photos.legacy.location).toMatchObject({
      latitude: 31.235,
      longitude: 121.568,
    });
    expect(map.photos.legacy.exif).toMatchObject({
      GPSLatitude: 31.235,
      GPSLongitude: 121.568,
    });
    // coarse 保留海拔（不暴露水平位置）；全精度组合键必须已删除
    expect(map.photos.legacy.exif).toMatchObject({ GPSAltitude: 12 });
    expect(map.photos.legacy.exif).not.toHaveProperty("GPSCoordinates");
    expect(sourcePhoto.location.latitude).toBe(31.234567);
    expect(sourcePhoto).not.toHaveProperty("processing");
  });
});
