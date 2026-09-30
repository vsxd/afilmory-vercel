import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertManifest } from "@afilmory/schema";
import type { Tags } from "exiftool-vendored";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AfilmoryBuilder } from "../builder/builder.js";
import { createDefaultBuilderConfig } from "../config/defaults.js";
import { ExifService } from "../image/exif.js";
import { setConsoleForwarding } from "../logger/logger.js";
import type { BuilderPlugin } from "../plugins/types.js";
import type { S3Config } from "../storage/interfaces.js";
import { StorageManager } from "../storage/manager.js";

const options = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
};
const directories: string[] = [];
const builders: AfilmoryBuilder[] = [];

async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-invalidation-"),
  );
  directories.push(root);
  const source = path.join(root, "source");
  await fs.mkdir(source);
  const image = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
  await fs.writeFile(path.join(source, "photo.jpg"), image);
  const config = createDefaultBuilderConfig();
  config.user = {
    storage: { provider: "local", basePath: source, baseUrl: "/originals" },
  };
  config.plugins = [];
  config.system.processing.worker.useClusterMode = false;
  config.output = {
    manifestPath: path.join(root, "manifest.json"),
    thumbnailsDir: path.join(root, "thumbnails"),
    originalsDir: path.join(root, "originals"),
  };
  const build = async (overrides = {}) => {
    const builder = new AfilmoryBuilder(config);
    builders.push(builder);
    return await builder.buildManifest({ ...options, ...overrides });
  };
  const read = async () =>
    assertManifest(
      JSON.parse(await fs.readFile(config.output.manifestPath, "utf8")),
    );
  return { config, image, build, read };
}

beforeEach(() => setConsoleForwarding(false));
afterEach(async () => {
  vi.restoreAllMocks();
  for (const builder of builders.splice(0)) builder.dispose();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
  setConsoleForwarding(true);
});

describe("builder incremental invalidation", () => {
  it("preserves old EXIF after a forced read failure and retries during ordinary incremental builds", async () => {
    const { build, read } = await fixture();
    const exifRead = vi
      .spyOn(ExifService.prototype, "read")
      .mockResolvedValueOnce({
        SourceFile: "photo.jpg",
        Make: "Old camera",
        Model: "A",
      })
      .mockRejectedValueOnce(new Error("ExifTool timed out"))
      .mockResolvedValueOnce({
        SourceFile: "photo.jpg",
        Make: "Recovered camera",
        Model: "B",
      });
    await build();
    const previous = (await read()).photos[0];
    expect(await build({ isForceManifest: true })).toMatchObject({
      failedCount: 1,
      totalPhotos: 1,
    });
    const fallback = (await read()).photos[0];
    expect(fallback.exif).toEqual(previous.exif);
    expect(fallback.thumbnailUrl).toBe(previous.thumbnailUrl);
    expect(fallback.processing?.exif).toBeUndefined();
    expect(await build()).toMatchObject({ failedCount: 0, processedCount: 1 });
    expect((await read()).photos[0].exif).toMatchObject({
      Make: "Recovered camera",
    });
    expect(exifRead).toHaveBeenCalledTimes(3);
  });

  it("retries new-photo EXIF failures but does not retry valid photos without EXIF", async () => {
    const { build, read } = await fixture();
    const exifRead = vi
      .spyOn(ExifService.prototype, "read")
      .mockRejectedValueOnce(new Error("ExifTool timed out"))
      .mockResolvedValue({ SourceFile: "photo.jpg" } as Tags);
    expect(await build()).toMatchObject({ failedCount: 1, totalPhotos: 0 });
    expect(await build()).toMatchObject({ failedCount: 0, newCount: 1 });
    expect((await read()).photos[0].exif).toEqual({});
    expect(await build()).toMatchObject({ failedCount: 0, processedCount: 0 });
    expect(exifRead).toHaveBeenCalledTimes(2);
  });

  it("publishes S3 addressing changes without downloads and lets plugins override refreshed URLs", async () => {
    const { config, image, build, read } = await fixture();
    const storage: S3Config = {
      provider: "s3",
      bucket: "photos",
      endpoint: "https://store.example",
      forcePathStyle: true,
      accessKeyId: "fixture",
      secretAccessKey: "fixture",
    };
    config.user = { storage };
    vi.spyOn(ExifService.prototype, "read").mockResolvedValue({
      SourceFile: "photo.jpg",
    });
    vi.spyOn(
      StorageManager.prototype,
      "listAllFilesDetailed",
    ).mockResolvedValue({
      complete: true,
      objects: [
        {
          key: "photo.jpg",
          size: image.length,
          lastModified: new Date("2026-01-01"),
          etag: "image",
        },
        {
          key: "photo.mov",
          size: 10,
          lastModified: new Date("2026-01-01"),
          etag: "video",
        },
      ],
    });
    const download = vi
      .spyOn(StorageManager.prototype, "getFile")
      .mockResolvedValue(image);
    await build();
    const previous = (await read()).photos[0];
    storage.forcePathStyle = false;
    expect(await build()).toMatchObject({
      processedCount: 0,
      hasUpdates: true,
    });
    const updated = (await read()).photos[0];
    expect(updated.id).toBe(previous.id);
    expect(updated.originalUrl).toBe("https://photos.store.example/photo.jpg");
    expect(updated.video).toMatchObject({
      videoUrl: "https://photos.store.example/photo.mov",
    });
    storage.customDomain = "https://new.example";
    config.plugins = [
      {
        name: "url-override",
        hooks: {
          beforeAddManifestItem: ({ payload }) => {
            expect(payload.item.originalUrl).toBe(
              "https://new.example/photo.jpg",
            );
            payload.item.originalUrl = "https://plugin.example/photo.jpg";
          },
        },
      } satisfies BuilderPlugin,
    ];
    await build();
    expect((await read()).photos[0].originalUrl).toBe(
      "https://plugin.example/photo.jpg",
    );
    expect(download).toHaveBeenCalledTimes(1);
  });
});
