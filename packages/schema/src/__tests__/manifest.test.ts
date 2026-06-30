import { describe, expect, it } from "vitest";

import type { PhotoManifestItem } from "../index";
import {
  AFILMORY_MANIFEST_SCHEMA,
  assertManifest,
  createEmptyManifest,
  createManifest,
  ManifestValidationError,
  parseManifest,
  parseManifestLenient,
  validateManifest,
} from "../index";

function createValidPhoto(
  overrides: Partial<PhotoManifestItem> = {},
): PhotoManifestItem {
  return {
    id: "photo",
    originalUrl: "https://example.com/photo.jpg",
    thumbnailUrl: "/thumbnails/photo.jpg",
    thumbHash: null,
    width: 4000,
    height: 3000,
    aspectRatio: 4 / 3,
    s3Key: "photos/photo.jpg",
    lastModified: "2026-06-06T00:00:00.000Z",
    size: 1234,
    etag: "etag",
    exif: null,
    toneAnalysis: null,
    location: null,
    title: "photo",
    dateTaken: "2026-06-06T00:00:00.000Z",
    tags: [],
    description: "",
    ...overrides,
  };
}

describe("manifest v2 schema", () => {
  it("creates an empty v2 manifest", () => {
    const manifest = createEmptyManifest();

    expect(manifest.schema).toBe(AFILMORY_MANIFEST_SCHEMA);
    expect(manifest.version).toBe(2);
    expect(manifest.photos).toEqual([]);
    expect(manifest.indexes).toEqual({ cameras: [], lenses: [] });
  });

  it("parses a valid v2 manifest", () => {
    const input = createManifest({
      generatedAt: "2026-06-06T00:00:00.000Z",
      source: { provider: "s3", bucket: "photos", region: "us-east-1" },
      photos: [createValidPhoto()],
      indexes: {
        cameras: [{ make: "Sony", model: "A7C", displayName: "Sony A7C" }],
      },
    });

    expect(parseManifest(input)).toEqual(input);
    expect(assertManifest(input)).toEqual(input);
    expect(validateManifest(input).success).toBe(true);
  });

  it("does not migrate legacy manifests", () => {
    expect(
      parseManifest({ version: "v10", data: [{ id: "legacy" }] }).photos,
    ).toEqual([]);
    expect(() =>
      assertManifest({ version: "v10", data: [{ id: "legacy" }] }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects invalid source, indexes, and photo fields in strict mode", () => {
    const invalid = {
      ...createManifest({
        photos: [
          createValidPhoto({
            width: "4000" as never,
          }),
        ],
      }),
      source: { provider: "local" },
      indexes: {
        cameras: [{ make: "Sony", model: 7 }],
        lenses: "none",
      },
    };

    const result = validateManifest(invalid);

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        "source.provider must be 's3' or 'unknown'",
        "indexes.cameras[0].model must be a string",
        "indexes.cameras[0].displayName must be a string",
        "indexes.lenses must be an array",
        "photos[0].width must be a number",
      ]),
    });
    expect(parseManifest(invalid).photos).toEqual([]);
  });

  it("rejects missing required photo fields in strict mode", () => {
    const input = createManifest({
      photos: [
        {
          id: "photo",
        } as never,
      ],
    });

    const result = validateManifest(input);

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        "photos[0].originalUrl must be a string",
        "photos[0].tags must be a string array",
      ]),
    });
  });

  describe("parseManifestLenient", () => {
    it("drops only photos missing a core addressing field and keeps the rest", () => {
      const input = createManifest({
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "s3", bucket: "photos", region: "us-east-1" },
        photos: [
          createValidPhoto({ id: "good-1" }),
          // originalUrl 是查看照片必需的核心字段，损坏即无法使用 → 丢弃
          createValidPhoto({ id: "bad", originalUrl: 123 as never }),
          createValidPhoto({ id: "good-2" }),
        ],
      });

      const { manifest, skipped } = parseManifestLenient(input);

      expect(manifest.photos.map((photo) => photo.id)).toEqual([
        "good-1",
        "good-2",
      ]);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]).toMatchObject({ index: 1 });
      expect(skipped[0].issues).toContain(
        "photos[1].originalUrl must be a string",
      );
    });

    it("salvages a photo whose only defect is a recoverable field", () => {
      const input = createManifest({
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "s3", bucket: "photos", region: "us-east-1" },
        photos: [
          // 仅可默认的数值字段损坏（非核心寻址字段），由 normalizer 抢救后保留
          createValidPhoto({ id: "soft", width: "4000" as never }),
        ],
      });

      const { manifest, skipped } = parseManifestLenient(input);

      expect(manifest.photos.map((photo) => photo.id)).toEqual(["soft"]);
      expect(manifest.photos[0]!.width).toBe(0); // normalizer 默认值
      expect(skipped).toEqual([]);
    });

    it("keeps every photo when all are valid", () => {
      const input = createManifest({
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "s3", bucket: "photos", region: "us-east-1" },
        photos: [createValidPhoto({ id: "a" }), createValidPhoto({ id: "b" })],
      });

      const { manifest, skipped } = parseManifestLenient(input);

      expect(skipped).toEqual([]);
      expect(manifest.photos).toHaveLength(2);
    });

    it("throws on top-level structural corruption (not a per-photo issue)", () => {
      expect(() =>
        parseManifestLenient({ version: "v10", data: [{ id: "legacy" }] }),
      ).toThrow(ManifestValidationError);

      expect(() =>
        parseManifestLenient({
          ...createManifest({ photos: [] }),
          photos: "not-an-array" as never,
        }),
      ).toThrow(ManifestValidationError);
    });

    it("drops malformed index entries instead of failing the whole manifest", () => {
      const input = {
        ...createManifest({
          generatedAt: "2026-06-06T00:00:00.000Z",
          source: { provider: "s3", bucket: "photos", region: "us-east-1" },
          photos: [createValidPhoto({ id: "a" })],
        }),
        indexes: {
          cameras: [
            { make: "Sony", model: "A7C", displayName: "Sony A7C" },
            { make: "Bad", model: 7 }, // model 非字符串 + 缺 displayName
          ],
          lenses: "not-an-array",
        },
      };

      const { manifest, skipped } = parseManifestLenient(input);

      expect(skipped).toEqual([]);
      expect(manifest.photos).toHaveLength(1);
      // 坏的 camera 条目被丢弃，好的保留；非数组 lenses 被规整为空数组
      expect(manifest.indexes.cameras).toEqual([
        { make: "Sony", model: "A7C", displayName: "Sony A7C" },
      ]);
      expect(manifest.indexes.lenses).toEqual([]);
    });
  });
});
