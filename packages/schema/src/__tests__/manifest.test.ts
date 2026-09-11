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
  const id = overrides.id ?? "photo";
  return {
    id,
    originalUrl: "https://example.com/photo.jpg",
    thumbnailUrl: "/thumbnails/photo.jpg",
    thumbHash: null,
    width: 4000,
    height: 3000,
    aspectRatio: 4 / 3,
    s3Key: `photos/${id}.jpg`,
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
      photos: [createValidPhoto({ exif: { Make: "Sony", Model: "A7C" } })],
      indexes: {
        cameras: [{ make: "Sony", model: "A7C", displayName: "Sony A7C" }],
      },
    });

    expect(parseManifest(input)).toEqual(input);
    expect(assertManifest(input)).toEqual(input);
    expect(validateManifest(input).success).toBe(true);
  });

  it("keeps optional Live Photo sidecar versions and remains backward compatible", () => {
    const versioned = createManifest({
      photos: [
        createValidPhoto({
          video: {
            type: "live-photo",
            videoUrl: "/originals/photo.mov",
            s3Key: "photos/photo.mov",
            version: "etag:video-v2",
          },
        }),
      ],
    });
    const legacy = createManifest({
      photos: [
        createValidPhoto({
          video: {
            type: "live-photo",
            videoUrl: "/originals/photo.mov",
            s3Key: "photos/photo.mov",
          },
        }),
      ],
    });

    expect(assertManifest(versioned).photos[0]?.video).toMatchObject({
      version: "etag:video-v2",
    });
    expect(validateManifest(legacy).success).toBe(true);
  });

  it("round-trips optional per-stage processing fingerprints", () => {
    const input = createManifest({
      photos: [
        createValidPhoto({
          processing: {
            thumbnail: "thumbnail:v2",
            exif: "exif:v2",
            tone: "tone:v2",
            media: "media-detection:v2",
            privacy: "location-privacy:v1:coarse",
          },
        }),
      ],
    });

    expect(assertManifest(input).photos[0]?.processing).toEqual(
      input.photos[0]?.processing,
    );
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
      source: { provider: "ftp" },
      indexes: {
        cameras: [{ make: "Sony", model: 7 }],
        lenses: "none",
      },
    };

    const result = validateManifest(invalid);

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        "source.provider must be 's3', 'local' or 'unknown'",
        "indexes.cameras[0].model must be a non-empty string",
        "indexes.cameras[0].displayName must be a non-empty string",
        "indexes.lenses must be an array",
        "photos[0].width must be a positive integer",
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
        "photos[0].originalUrl must be a non-empty string",
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
        "photos[1].originalUrl must be a non-empty string",
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

      const { manifest, repaired, skipped } = parseManifestLenient(input);

      expect(manifest.photos.map((photo) => photo.id)).toEqual(["soft"]);
      expect(manifest.photos[0]!.width).toBe(1); // normalizer 产出仍满足严格不变量
      expect(skipped).toEqual([]);
      expect(repaired).toEqual([
        expect.objectContaining({ index: 0, s3Key: "photos/soft.jpg" }),
      ]);
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

    it("salvages a corrupted source instead of failing the whole manifest", () => {
      const input = {
        ...createManifest({
          generatedAt: "2026-06-06T00:00:00.000Z",
          photos: [createValidPhoto({ id: "a" })],
        }),
        // source 全仓无读方：未知 provider（例如更新版 builder 新增的值）
        // 不应让一个本可正常渲染的图库进诊断页/触发全量重建
        source: { provider: "ftp", bucket: 123 },
      };

      const { manifest, skipped } = parseManifestLenient(input);

      expect(skipped).toEqual([]);
      expect(manifest.photos.map((photo) => photo.id)).toEqual(["a"]);
      expect(manifest.source).toEqual({ provider: "unknown" });
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

  it("enforces safe unique IDs, unique storage keys, and sane numbers", () => {
    const result = validateManifest(
      createManifest({
        photos: [
          createValidPhoto({ id: "Photo", size: -1 }),
          createValidPhoto({ id: "Photo", s3Key: "photos/Photo.jpg" }),
          createValidPhoto({ id: "photos/evil" }),
        ],
      }),
    );

    expect(result).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        "photos[0].size must be a non-negative number",
        "photos[1].id duplicates photos[0].id",
        "photos[1].s3Key duplicates photos[0].s3Key",
        "photos[2].id must be a non-empty safe identifier",
      ]),
    });
  });

  // 旧版 builder 铸造过 NFD、含 ':'、仅大小写不同的 id；它们承载着已发布的
  // /photos/<id> 永久链接，解析层（严格与宽松）都必须原样保留。
  it("keeps legacy non-portable IDs and case-variant IDs (published permalinks)", () => {
    const legacyIds = [
      "café".normalize("NFD"),
      "sunset-🌅",
      "IMG 0001 (2)",
      "scan:2019",
      "Sunset",
      "sunset",
    ];
    const input = createManifest({
      photos: legacyIds.map((id, index) =>
        createValidPhoto({ id, s3Key: `photos/${index}.jpg` }),
      ),
    });

    const strict = validateManifest(input);
    expect(strict.success).toBe(true);

    const { manifest, skipped } = parseManifestLenient(input);
    expect(skipped).toEqual([]);
    expect(manifest.photos.map((photo) => photo.id)).toEqual(legacyIds);
  });

  it.each([".", "..", "photo-\ud800", "photo-\udfff"])(
    "rejects IDs that cannot safely form a photo URL: %j",
    (id) => {
      const input = createManifest({
        photos: [
          createValidPhoto({ id: "valid" }),
          createValidPhoto({ id, s3Key: "photos/invalid.jpg" }),
        ],
      });

      expect(validateManifest(input)).toMatchObject({
        success: false,
        issues: ["photos[1].id must be a non-empty safe identifier"],
      });
      const recovered = parseManifestLenient(input);
      expect(recovered.manifest.photos.map((photo) => photo.id)).toEqual([
        "valid",
      ]);
      expect(recovered.skipped).toEqual([
        {
          index: 1,
          issues: ["photos[1].id must be a non-empty safe identifier"],
        },
      ]);
    },
  );

  it("repairs cross-field aspect ratios and validates index references", () => {
    const input = createManifest({
      photos: [createValidPhoto({ id: "ratio", aspectRatio: 99 })],
      indexes: {
        cameras: [{ make: "Sony", model: "A7C", displayName: "Sony A7C" }],
      },
    });
    const strict = validateManifest(input);
    const lenient = parseManifestLenient(input);

    expect(strict).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        "photos[0].aspectRatio must match width / height",
        "indexes.cameras[0] must reference a photo",
      ]),
    });
    expect(lenient.manifest.photos[0]!.aspectRatio).toBeCloseTo(4 / 3);
    expect(lenient.repaired).toHaveLength(1);
  });
});
