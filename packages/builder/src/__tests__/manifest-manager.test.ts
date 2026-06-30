import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AFILMORY_MANIFEST_SCHEMA } from "@afilmory/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  handleDeletedPhotos,
  loadExistingManifest,
  needsUpdate,
} from "../manifest/manager.js";
import { CURRENT_MANIFEST_VERSION } from "../manifest/version.js";
import type { BuilderOutputSettings } from "../output-paths.js";
import { runWithBuilderOutputSettings } from "../output-paths.js";
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
      runWithBuilderOutputSettings(outputSettings, () =>
        handleDeletedPhotos([createPhotoManifestItem("keep")]),
      ),
    ).resolves.toBe(0);
  });

  it("removes thumbnails that are no longer present in the manifest", async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.writeFile(path.join(thumbnailsDir, "keep.jpg"), "");
    await fs.writeFile(path.join(thumbnailsDir, "remove.jpg"), "");

    const deletedCount = await runWithBuilderOutputSettings(
      outputSettings,
      () => handleDeletedPhotos([createPhotoManifestItem("keep")]),
    );

    expect(deletedCount).toBe(1);
    await expect(
      fs.access(path.join(thumbnailsDir, "keep.jpg")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(thumbnailsDir, "remove.jpg")),
    ).rejects.toMatchObject({ code: "ENOENT" });
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

  it("creates a new manifest only when the file does not exist", async () => {
    const manifest = await runWithBuilderOutputSettings(outputSettings, () =>
      loadExistingManifest(),
    );

    expect(manifest.schema).toBe(AFILMORY_MANIFEST_SCHEMA);
    expect(manifest.version).toBe(CURRENT_MANIFEST_VERSION);
    expect(manifest.photos).toEqual([]);
    await expect(fs.access(manifestPath)).resolves.toBeUndefined();
  });

  it("discards a legacy manifest and rebuilds from scratch instead of throwing", async () => {
    // 顶层结构无效（旧版 schema）不应让构建永久失败：丢弃缓存、全量重建。
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ version: "v10", data: [{ id: "legacy" }] }),
    );

    const manifest = await runWithBuilderOutputSettings(outputSettings, () =>
      loadExistingManifest(),
    );

    expect(manifest.photos).toEqual([]);
    expect(manifest.version).toBe(CURRENT_MANIFEST_VERSION);
    // 损坏的缓存文件被覆盖为有效的空 manifest，下一次读取不会再失败。
    const rewritten = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(rewritten.schema).toBe(AFILMORY_MANIFEST_SCHEMA);
    expect(rewritten.version).toBe(CURRENT_MANIFEST_VERSION);
    expect(rewritten.photos).toEqual([]);
  });

  it("discards an unreadable manifest and rebuilds from scratch instead of throwing", async () => {
    await fs.writeFile(manifestPath, "{ invalid json");

    const manifest = await runWithBuilderOutputSettings(outputSettings, () =>
      loadExistingManifest(),
    );

    expect(manifest.photos).toEqual([]);
    const rewritten = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(rewritten.version).toBe(CURRENT_MANIFEST_VERSION);
    expect(rewritten.photos).toEqual([]);
  });

  it("keeps valid photos and drops only the corrupt records from the cache", async () => {
    // 个别照片字段损坏只跳过该张（会被当作新照片重新处理），其余照片照常复用。
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
        photos: [validPhoto, { ...validPhoto, id: "bad", width: "oops" }],
      }),
    );

    const manifest = await runWithBuilderOutputSettings(outputSettings, () =>
      loadExistingManifest(),
    );

    expect(manifest.photos.map((photo) => photo.id)).toEqual(["good"]);
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
