import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AFILMORY_MANIFEST_SCHEMA } from "@afilmory/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createThumbnailFileName,
  getThumbnailPublicUrlForFileName,
} from "../image/thumbnail.js";
import {
  handleDeletedPhotos,
  loadExistingManifest,
  loadExistingManifestWithDiagnostics,
  needsUpdate,
  saveManifest,
} from "../manifest/manager.js";
import { CURRENT_MANIFEST_VERSION } from "../manifest/version.js";
import type { BuilderOutputSettings } from "../output-paths.js";
import type { PhotoManifestItem } from "../types/photo.js";

function createPhotoManifestItem(id: string): PhotoManifestItem {
  return {
    id,
    title: id,
    description: "",
    dateTaken: "2024-01-01T00:00:00.000Z",
    tags: [],
    originalUrl: `/originals/${id}.jpg`,
    thumbnailUrl: `/thumbnails/${id}.jpg`,
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: `${id}.jpg`,
    lastModified: "2024-01-01T00:00:00.000Z",
    size: 1,
    exif: null,
    toneAnalysis: null,
    location: null,
  };
}

describe("handleDeletedPhotos", () => {
  let tmpDir: string;
  let thumbnailsDir: string;
  let outputSettings: BuilderOutputSettings;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-manifest-"));
    thumbnailsDir = path.join(tmpDir, "thumbnails");

    outputSettings = {
      manifestPath: path.join(tmpDir, "photos-manifest.json"),
      thumbnailsDir,
      originalsDir: path.join(tmpDir, "originals"),
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns zero when the thumbnails directory does not exist", async () => {
    await expect(
      handleDeletedPhotos(outputSettings, [createPhotoManifestItem("keep")]),
    ).resolves.toBe(0);
  });

  it("clears only owned artifacts for an empty gallery", async () => {
    await fs.mkdir(path.join(thumbnailsDir, "unrelated"), { recursive: true });
    await fs.writeFile(path.join(thumbnailsDir, "orphan.jpg"), "thumbnail");
    await fs.writeFile(path.join(thumbnailsDir, "stranger.jpg"), "personal");
    await fs.writeFile(path.join(thumbnailsDir, ".encoding"), "signature");
    await fs.writeFile(path.join(thumbnailsDir, "keep.txt"), "keep");
    await fs.writeFile(
      path.join(thumbnailsDir, "unrelated", "keep.jpg"),
      "keep",
    );

    await expect(
      handleDeletedPhotos(outputSettings, [], undefined, new Set(["orphan"])),
    ).resolves.toBe(1);
    await expect(
      fs.access(path.join(thumbnailsDir, "orphan.jpg")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(thumbnailsDir, ".encoding")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.readFile(path.join(thumbnailsDir, "keep.txt"), "utf8"),
    ).resolves.toBe("keep");
    await expect(
      fs.readFile(path.join(thumbnailsDir, "stranger.jpg"), "utf8"),
    ).resolves.toBe("personal");
    await expect(
      fs.readFile(path.join(thumbnailsDir, "unrelated", "keep.jpg"), "utf8"),
    ).resolves.toBe("keep");
  });

  it("removes thumbnails that are no longer present in the manifest", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.writeFile(path.join(thumbnailsDir, "keep.jpg"), "");
    await fs.writeFile(path.join(thumbnailsDir, "remove.jpg"), "");

    const deletedCount = await handleDeletedPhotos(
      outputSettings,
      [createPhotoManifestItem("keep")],
      undefined,
      new Set(["remove"]),
    );

    expect(deletedCount).toBe(1);
    await expect(
      fs.access(path.join(thumbnailsDir, "keep.jpg")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(thumbnailsDir, "remove.jpg")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps thumbnails of photos still present in storage (failed this run)", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.writeFile(path.join(thumbnailsDir, "keep.jpg"), "");
    await fs.writeFile(path.join(thumbnailsDir, "failed.jpg"), "");
    await fs.writeFile(path.join(thumbnailsDir, "gone.jpg"), "");

    // failed 不在 manifest（本次处理失败）但仍在存储中 → 缩略图必须保留；
    // gone 既不在 manifest 也不在存储 → 才是真正的孤儿。
    const deletedCount = await handleDeletedPhotos(
      outputSettings,
      [createPhotoManifestItem("keep")],
      new Set(["keep", "failed"]),
      new Set(["failed", "gone"]),
    );

    expect(deletedCount).toBe(1);
    await expect(
      fs.access(path.join(thumbnailsDir, "failed.jpg")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(thumbnailsDir, "gone.jpg")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves non-jpg files like the .encoding marker untouched", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.writeFile(path.join(thumbnailsDir, "keep.jpg"), "");
    await fs.writeFile(path.join(thumbnailsDir, ".encoding"), "jpeg-w600-q80");

    const deletedCount = await handleDeletedPhotos(outputSettings, [
      createPhotoManifestItem("keep"),
    ]);

    expect(deletedCount).toBe(0);
    await expect(
      fs.readFile(path.join(thumbnailsDir, ".encoding"), "utf-8"),
    ).resolves.toBe("jpeg-w600-q80");
  });

  it("keeps only the currently referenced content-addressed version", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    const oldName = createThumbnailFileName("keep", Buffer.from("old"));
    const newName = createThumbnailFileName("keep", Buffer.from("new"));
    await fs.writeFile(path.join(thumbnailsDir, oldName), "old");
    await fs.writeFile(path.join(thumbnailsDir, newName), "new");
    const photo = createPhotoManifestItem("keep");
    photo.thumbnailUrl = getThumbnailPublicUrlForFileName(newName);

    await expect(handleDeletedPhotos(outputSettings, [photo])).resolves.toBe(1);
    await expect(
      fs.access(path.join(thumbnailsDir, oldName)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(thumbnailsDir, newName)),
    ).resolves.toBeUndefined();
  });

  it("retains published display variants and removes only owned stale versions", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    const name = (id: string, hash: string) =>
      `${id}.${hash.repeat(64)}.${"e".repeat(12)}.display-960.jpg`;
    const current = name("keep", "a");
    const stale = name("keep", "b");
    const removed = name("gone", "c");
    const unrelated = name("stranger", "d");
    const failed = name("failed", "f");
    for (const file of [current, stale, removed, unrelated, failed]) {
      await fs.writeFile(path.join(thumbnailsDir, file), "display");
    }
    const photo = createPhotoManifestItem("keep");
    // CDN thumbnail names must not prevent cleanup of old local display files.
    photo.thumbnailUrl = "https://cdn.example.com/opaque.jpg";
    photo.displayImages = [
      { url: `/thumbnails/${current}`, width: 960, height: 720 },
    ];
    await expect(
      handleDeletedPhotos(
        outputSettings,
        [photo],
        new Set(["keep", "failed"]),
        new Set(["gone", "failed"]),
      ),
    ).resolves.toBe(0);
    expect((await fs.readdir(thumbnailsDir)).sort()).toEqual(
      [current, unrelated, failed].sort(),
    );
    await handleDeletedPhotos(
      outputSettings,
      [],
      undefined,
      new Set(["keep", "failed"]),
    );
    expect(await fs.readdir(thumbnailsDir)).toEqual([unrelated]);
  });

  it("cleans up display variants for a 170-byte ID without changing the published ID", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    const id = `${"照".repeat(56)}ab`;
    const current = `${id}.${"a".repeat(64)}.display-2560.jpg`;
    const stale = `${id}.${"b".repeat(64)}.display-2560.jpg`;
    await fs.writeFile(path.join(thumbnailsDir, current), "current");
    await fs.writeFile(path.join(thumbnailsDir, stale), "stale");
    const photo = createPhotoManifestItem(id);
    photo.displayImages = [
      {
        url: `/thumbnails/${encodeURIComponent(current)}`,
        width: 2560,
        height: 1600,
      },
    ];
    await handleDeletedPhotos(outputSettings, [photo]);
    expect(await fs.readdir(thumbnailsDir)).toEqual([current]);
    await handleDeletedPhotos(outputSettings, [], undefined, new Set([id]));
    await expect(fs.access(thumbnailsDir)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("loadExistingManifest", () => {
  let tmpDir: string;
  let manifestPath: string;
  let outputSettings: BuilderOutputSettings;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-load-manifest-"),
    );
    manifestPath = path.join(tmpDir, "photos-manifest.json");

    outputSettings = {
      manifestPath,
      thumbnailsDir: path.join(tmpDir, "thumbnails"),
      originalsDir: path.join(tmpDir, "originals"),
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("starts with an in-memory empty cache when the file does not exist", async () => {
    const manifest = await loadExistingManifest(outputSettings);

    expect(manifest.schema).toBe(AFILMORY_MANIFEST_SCHEMA);
    expect(manifest.version).toBe(CURRENT_MANIFEST_VERSION);
    expect(manifest.photos).toEqual([]);
    await expect(fs.access(manifestPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("discards a legacy manifest and rebuilds from scratch instead of throwing", async () => {
    // 顶层结构无效（旧版 schema）不应让构建永久失败：丢弃缓存、全量重建。
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ version: "v10", data: [{ id: "legacy" }] }),
    );

    const manifest = await loadExistingManifest(outputSettings);

    expect(manifest.photos).toEqual([]);
    expect(manifest.version).toBe(CURRENT_MANIFEST_VERSION);
    // Loading is read-only: only a fully scanned, strictly validated candidate
    // may atomically replace the previous bytes later in ArtifactWriter.
    expect(JSON.parse(await fs.readFile(manifestPath, "utf-8"))).toEqual({
      version: "v10",
      data: [{ id: "legacy" }],
    });
  });

  it("discards an unreadable manifest and rebuilds from scratch instead of throwing", async () => {
    await fs.writeFile(manifestPath, "{ invalid json");

    const manifest = await loadExistingManifest(outputSettings);

    expect(manifest.photos).toEqual([]);
    expect(await fs.readFile(manifestPath, "utf-8")).toBe("{ invalid json");
  });

  it("keeps salvageable photos and drops only those missing a core field", async () => {
    // 核心寻址字段（如 originalUrl）损坏的照片无法使用，跳过该张（会被当作新照片重新
    // 处理）；仅可恢复字段损坏的照片由 normalizer 抢救后保留，其余照片照常复用。
    const validPhoto = {
      id: "good",
      originalUrl: "https://example.com/good.jpg",
      thumbnailUrl: "/thumbnails/good.jpg",
      thumbHash: null,
      width: 4000,
      height: 3000,
      aspectRatio: 4 / 3,
      s3Key: "good.jpg",
      lastModified: "2026-06-06T00:00:00.000Z",
      size: 1234,
      exif: null,
      toneAnalysis: null,
      location: null,
      title: "good",
      dateTaken: "2026-06-06T00:00:00.000Z",
      tags: [],
      description: "",
    };
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        schema: AFILMORY_MANIFEST_SCHEMA,
        version: CURRENT_MANIFEST_VERSION,
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "s3", bucket: "photos", region: "us-east-1" },
        indexes: { cameras: [], lenses: [] },
        photos: [
          validPhoto,
          // 可恢复字段损坏（数值），由 normalizer 抢救后保留
          { ...validPhoto, id: "soft", s3Key: "soft.jpg", width: "oops" },
          // 核心寻址字段损坏，无法使用 → 跳过
          { ...validPhoto, id: "fatal", originalUrl: 123 },
        ],
      }),
    );

    const manifest = await loadExistingManifest(outputSettings);

    expect(manifest.photos.map((photo) => photo.id)).toEqual(["good", "soft"]);
  });

  it("reports normalized records as repaired cache entries", async () => {
    const photo = createPhotoManifestItem("repair-me");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        schema: AFILMORY_MANIFEST_SCHEMA,
        version: CURRENT_MANIFEST_VERSION,
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "unknown" },
        indexes: { cameras: [], lenses: [] },
        photos: [{ ...photo, width: "broken" }],
      }),
    );

    const loaded = await loadExistingManifestWithDiagnostics(outputSettings);

    expect(loaded.manifest.photos[0]!.width).toBe(1);
    expect(loaded.repairedPhotoKeys).toEqual(new Set([photo.s3Key]));
    expect(loaded.requiresRewrite).toBe(true);
  });

  it("marks recoverable derived indexes for an on-disk rewrite", async () => {
    const photo = createPhotoManifestItem("repair-indexes");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        schema: AFILMORY_MANIFEST_SCHEMA,
        version: CURRENT_MANIFEST_VERSION,
        generatedAt: "2026-06-06T00:00:00.000Z",
        source: { provider: "unknown" },
        photos: [photo],
      }),
    );

    const loaded = await loadExistingManifestWithDiagnostics(outputSettings);

    expect(loaded.manifest.indexes).toEqual({ cameras: [], lenses: [] });
    expect(loaded.requiresRewrite).toBe(true);
  });

  it("preserves generatedAt and bytes when the candidate is unchanged", async () => {
    const photo = createPhotoManifestItem("stable");
    const first = await saveManifest(outputSettings, [photo]);
    const firstBytes = await fs.readFile(manifestPath, "utf8");

    const second = await saveManifest(
      outputSettings,
      [photo],
      [],
      [],
      { provider: "unknown" },
      { previousManifest: first.manifest },
    );

    expect(second.written).toBe(false);
    expect(second.manifest.generatedAt).toBe(first.manifest.generatedAt);
    expect(await fs.readFile(manifestPath, "utf8")).toBe(firstBytes);
  });

  it("rewrites a normalized manifest even when its semantic data is unchanged", async () => {
    const photo = createPhotoManifestItem("normalized");
    const first = await saveManifest(outputSettings, [photo]);

    const rewritten = await saveManifest(
      outputSettings,
      [photo],
      [],
      [],
      { provider: "unknown" },
      { forceWrite: true, previousManifest: first.manifest },
    );

    expect(rewritten.written).toBe(true);
    expect(rewritten.manifest.generatedAt).toBe(first.manifest.generatedAt);
  });

  it("validates before replacing the last successful manifest", async () => {
    const valid = createPhotoManifestItem("valid");
    const first = await saveManifest(outputSettings, [valid]);
    const firstBytes = await fs.readFile(manifestPath, "utf8");

    await expect(
      saveManifest(
        outputSettings,
        [{ ...valid, id: "" }],
        [],
        [],
        { provider: "unknown" },
        { previousManifest: first.manifest },
      ),
    ).rejects.toThrow(/safe identifier/);
    expect(await fs.readFile(manifestPath, "utf8")).toBe(firstBytes);
  });
});

describe("needsUpdate", () => {
  it("detects same-timestamp content changes by size and etag", () => {
    const existing = {
      ...createPhotoManifestItem("photo"),
      lastModified: "2024-01-01T00:00:00.000Z",
      size: 1,
      etag: "old",
    };

    expect(
      needsUpdate(existing, {
        key: "photo.jpg",
        lastModified: new Date("2024-01-01T00:00:00.000Z"),
        size: 2,
        etag: "old",
      }),
    ).toBe(true);
    expect(
      needsUpdate(existing, {
        key: "photo.jpg",
        lastModified: new Date("2024-01-01T00:00:00.000Z"),
        size: 1,
        etag: "new",
      }),
    ).toBe(true);
  });
});
