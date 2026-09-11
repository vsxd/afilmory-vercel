import { describe, expect, it } from "vitest";

import type { PhotoManifestItem } from "../index";
import {
  createManifest,
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

function createInput(photos: unknown[]): Record<string, unknown> {
  return {
    ...createManifest({
      generatedAt: "2026-06-06T00:00:00.000Z",
      source: { provider: "s3", bucket: "photos", region: "us-east-1" },
    }),
    photos,
  };
}

// 严格/宽松一致性：两个入口共享同一份字段描述符，这里固化住这个约定，
// 防止未来重新分叉出行为漂移。
describe("strict/lenient agreement", () => {
  const inputs: Record<string, unknown[]> = {
    "all valid": [
      createValidPhoto({ id: "a" }),
      createValidPhoto({
        id: "b",
        isHDR: true,
        toneAnalysis: {
          toneType: "low-key",
          brightness: 0.2,
          contrast: 0.9,
          shadowRatio: 0.7,
          highlightRatio: 0.1,
        },
        location: { latitude: 1.5, longitude: 2.5 },
        video: { type: "live-photo", videoUrl: "/v.mov", s3Key: "v.mov" },
        exif: { Make: "Sony", ISO: 100 },
      }),
    ],
    "fatally bad photo": [
      createValidPhoto({ id: "good" }),
      createValidPhoto({ id: "bad", originalUrl: 123 as never }),
      "not-an-object",
    ],
    "recoverable photo": [
      createValidPhoto({ id: "soft", width: "4000" as never }),
    ],
    "mixed fatal and recoverable": [
      createValidPhoto({ id: "", title: 7 as never }), // 空 id → 致命
      createValidPhoto({ id: "keep", aspectRatio: Number.NaN as never }),
    ],
  };

  it("returns photos accepted by strict mode identically from lenient mode", () => {
    for (const photos of Object.values(inputs)) {
      const input = createInput(photos);
      const strict = validateManifest(input);
      if (!strict.success) continue;
      const lenient = parseManifestLenient(input);
      expect(lenient.skipped).toEqual([]);
      expect(lenient.manifest).toEqual(strict.manifest);
    }
    // 至少覆盖到一个严格模式通过的输入
    expect(validateManifest(createInput(inputs["all valid"]!)).success).toBe(
      true,
    );
  });

  it("reports every lenient-skip issue in strict mode too", () => {
    for (const photos of Object.values(inputs)) {
      const input = createInput(photos);
      const strict = validateManifest(input);
      const lenient = parseManifestLenient(input);
      for (const skippedPhoto of lenient.skipped) {
        expect(strict.success).toBe(false);
        if (strict.success) continue;
        for (const issue of skippedPhoto.issues) {
          expect(strict.issues).toContain(issue);
        }
      }
    }
    // 至少覆盖到一个会产生 skipped 的输入
    expect(
      parseManifestLenient(createInput(inputs["fatally bad photo"]!)).skipped,
    ).not.toEqual([]);
  });

  it("fails strict mode whenever lenient mode had to salvage a photo", () => {
    const input = createInput(inputs["recoverable photo"]!);
    const strict = validateManifest(input);
    const lenient = parseManifestLenient(input);

    // 宽松模式抢救保留（skipped 为空），但严格模式必须报告同一处损坏
    expect(lenient.skipped).toEqual([]);
    expect(lenient.manifest.photos.map((photo) => photo.id)).toEqual(["soft"]);
    expect(strict.success).toBe(false);
    expect(strict).toMatchObject({
      issues: expect.arrayContaining([
        "photos[0].width must be a positive integer",
      ]),
    });
  });
});

describe("exif sanitization", () => {
  function parseExif(exif: unknown) {
    const { manifest } = parseManifestLenient(
      createInput([createValidPhoto({ exif: exif as never })]),
    );
    return manifest.photos[0]!.exif;
  }

  it("drops junk keys with function values but keeps primitives", () => {
    const exif = parseExif({
      Make: "Sony",
      ISO: 100,
      MotionPhoto: true,
      junk: () => "pwned",
    });

    expect(exif).toEqual({ Make: "Sony", ISO: 100, MotionPhoto: true });
  });

  it("keeps nested plain objects and arrays, drops class instances", () => {
    const exif = parseExif({
      FujiRecipe: { FilmMode: "Classic Chrome", Clarity: 2 },
      ContainerDirectory: [{ Item: { Semantic: "Primary" } }],
      DateTimeOriginal: new Date("2026-06-06"),
      mixed: [1, () => "pwned"],
    });

    expect(exif).toEqual({
      FujiRecipe: { FilmMode: "Classic Chrome", Clarity: 2 },
      ContainerDirectory: [{ Item: { Semantic: "Primary" } }],
    });
  });

  it("ignores __proto__ prototype pollution attempts", () => {
    // JSON.parse 会把 __proto__ 还原成自有键，是真实攻击面
    const exif = parseExif(
      JSON.parse('{"__proto__": {"polluted": true}, "Make": "Sony"}'),
    );

    expect(exif).toEqual({ Make: "Sony" });
    expect(Object.prototype.hasOwnProperty.call(exif, "__proto__")).toBe(false);
    expect((exif as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("recursively clones nested EXIF and removes unsafe descendants", () => {
    const recipe = JSON.parse(
      '{"Name":"Classic","__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;
    recipe.callback = () => "pwned";
    recipe.invalidNumber = Number.POSITIVE_INFINITY;
    recipe.circular = recipe;

    const exif = parseExif({
      FujiRecipe: recipe,
      ContainerDirectory: [{ Item: { Semantic: "Primary" } }],
    });

    expect(exif).toEqual({
      FujiRecipe: { Name: "Classic" },
      ContainerDirectory: [{ Item: { Semantic: "Primary" } }],
    });
    expect(exif?.FujiRecipe).not.toBe(recipe);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("still passes strict validation while sanitizing the output", () => {
    const input = createInput([
      createValidPhoto({ exif: { Make: "Sony", junk: () => 1 } as never }),
    ]);

    // 严格模式历史上只检查 exif 是 null/对象，不检查内容——保持不变，
    // 但产出的"已验证" manifest 不再透传危险值。
    const strict = validateManifest(input);
    expect(strict.success).toBe(true);
    if (strict.success) {
      expect(strict.manifest.photos[0]!.exif).toEqual({ Make: "Sony" });
    }
  });
});

describe("localized location sanitization", () => {
  it("removes prototype keys from locale dictionaries in both parsing modes", () => {
    const input = createInput([
      createValidPhoto({
        location: {
          latitude: 1,
          longitude: 2,
          adminI18n: JSON.parse(
            '{"en":{"city":"London"},"__proto__":{"city":"Injected"},"constructor":{"city":"Injected"},"prototype":{"city":"Injected"}}',
          ),
          locationNameI18n: JSON.parse(
            '{"en":"London","__proto__":"Injected","constructor":"Injected","prototype":"Injected"}',
          ),
        },
      }),
    ]);
    const strict = validateManifest(input);
    expect(strict.success).toBe(true);
    if (!strict.success) return;

    for (const manifest of [
      strict.manifest,
      parseManifestLenient(input).manifest,
    ]) {
      const location = manifest.photos[0]!.location!;
      expect(location.adminI18n).toEqual({ en: { city: "London" } });
      expect(Object.getPrototypeOf(location.adminI18n)).toBe(Object.prototype);
      expect(location.locationNameI18n).toEqual({ en: "London" });
      expect(Object.keys(location.adminI18n!)).toEqual(["en"]);
      expect(Object.keys(location.locationNameI18n!)).toEqual(["en"]);
    }
  });
});

describe("local manifest source", () => {
  it("accepts and round-trips a local source in strict mode", () => {
    const input = createManifest({
      generatedAt: "2026-06-06T00:00:00.000Z",
      source: {
        provider: "local",
        basePath: "/srv/photos",
        baseUrl: "/photos",
      },
    });

    const strict = validateManifest(input);
    expect(strict.success).toBe(true);
    if (strict.success) {
      expect(strict.manifest.source).toEqual({
        provider: "local",
        basePath: "/srv/photos",
        baseUrl: "/photos",
      });
    }
  });

  it("preserves the local provider in lenient mode instead of coercing to unknown", () => {
    const { manifest } = parseManifestLenient(
      createManifest({
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "local", basePath: "/srv/photos" },
      }),
    );

    expect(manifest.source.provider).toBe("local");
  });

  it("rejects non-string local fields and unknown providers", () => {
    const badField = validateManifest({
      ...createManifest(),
      source: { provider: "local", basePath: 5 },
    });
    expect(badField.success).toBe(false);
    expect(badField).toMatchObject({
      issues: expect.arrayContaining([
        "source.basePath must be a string when present",
      ]),
    });

    const badProvider = validateManifest({
      ...createManifest(),
      source: { provider: "ftp" },
    });
    expect(badProvider.success).toBe(false);
    expect(badProvider).toMatchObject({
      issues: expect.arrayContaining([
        "source.provider must be 's3', 'local' or 'unknown'",
      ]),
    });
  });
});
