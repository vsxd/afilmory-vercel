import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  displayImagesExist,
  generateDisplayImages,
  getDisplayImageFileName,
  getDisplayImagePhotoId,
} from "./display-images.js";
import {
  createThumbnailFileName,
  createThumbnailInventory,
  getThumbnailPhotoIdFromFileName,
} from "./thumbnail.js";

const directories: string[] = [];
async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "afilmory-display-"));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("display images", () => {
  it("keeps historical long IDs on the original path without decoding or repeatedly requiring variants", async () => {
    const dir = await directory();
    const id = "照".repeat(60);
    expect(Buffer.byteLength(id)).toBe(180);
    const source = sharp({
      create: { width: 64, height: 48, channels: 3, background: "red" },
    });
    const metadata = vi.spyOn(source, "metadata");
    const images = await generateDisplayImages(source, id, dir);
    expect(images).toEqual([]);
    expect(metadata).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
    expect(await displayImagesExist(id, images, dir)).toBe(true);
    expect(
      await (await createThumbnailInventory(dir)).hasDisplayImages(id, images),
    ).toBe(true);
  });

  it("supports the maximum 170-byte photo ID without exceeding filesystem filename limits", async () => {
    const dir = await directory();
    const id = `${"照".repeat(56)}ab`;
    expect(Buffer.byteLength(id)).toBe(170);
    const source = await sharp({
      create: { width: 2560, height: 10, channels: 3, background: "red" },
    })
      .jpeg()
      .toBuffer();
    const images = await generateDisplayImages(sharp(source), id, dir);
    expect(images).toHaveLength(3);
    for (const image of images) {
      const fileName = getDisplayImageFileName(image.url, id)!;
      expect(Buffer.byteLength(fileName)).toBeLessThanOrEqual(255);
      expect(getDisplayImagePhotoId(fileName)).toBe(id);
    }
    expect(await displayImagesExist(id, images, dir)).toBe(true);
  });

  it("preserves a gain map reported by Sharp even without an EXIF detection flag", async () => {
    const dir = await directory();
    const source = sharp({
      create: { width: 64, height: 48, channels: 3, background: "red" },
    });
    const metadata = await source.metadata();
    vi.spyOn(source, "metadata").mockResolvedValueOnce({
      ...metadata,
      gainMap: { image: Buffer.from("gain map") },
    });
    expect(await generateDisplayImages(source, "hdr", dir)).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("keeps the display namespace distinct from thumbnail photo IDs", () => {
    const id = "photo.display.960";
    const name = createThumbnailFileName(id, Buffer.from("thumbnail"));
    expect(getDisplayImagePhotoId(name)).toBeNull();
    expect(getThumbnailPhotoIdFromFileName(name)).toBe(id);
  });

  it("orients once and writes three bounded, metadata-free sRGB JPEGs", async () => {
    const dir = await directory();
    const source = await sharp({
      create: { width: 3200, height: 2400, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const images = await generateDisplayImages(
      sharp(source),
      "portrait #1",
      dir,
    );
    expect(images.map(({ width, height }) => [width, height])).toEqual([
      [720, 960],
      [1200, 1600],
      [1920, 2560],
    ]);
    for (const image of images) {
      const name = getDisplayImageFileName(image.url, "portrait #1")!;
      expect(getDisplayImagePhotoId(name)).toBe("portrait #1");
      expect(getThumbnailPhotoIdFromFileName(name)).toBeNull();
      const metadata = await sharp(
        await readFile(path.join(dir, name)),
      ).metadata();
      expect(metadata).toMatchObject({
        format: "jpeg",
        width: image.width,
        height: image.height,
        space: "srgb",
      });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
    expect(await displayImagesExist("portrait #1", images, dir)).toBe(true);
    expect(
      await (
        await createThumbnailInventory(dir)
      ).hasDisplayImages("portrait #1", images),
    ).toBe(true);
    expect((await createThumbnailInventory(dir)).has("portrait #1")).toBe(
      false,
    );
  });

  it("never enlarges small photos or emits duplicate dimensions, and addresses content immutably", async () => {
    const dir = await directory();
    const source = await sharp({
      create: { width: 1200, height: 600, channels: 3, background: "blue" },
    })
      .jpeg()
      .toBuffer();
    const images = await generateDisplayImages(sharp(source), "small", dir);
    expect(images.map(({ width, height }) => [width, height])).toEqual([
      [960, 480],
      [1200, 600],
    ]);
    expect(await generateDisplayImages(sharp(source), "small", dir)).toEqual(
      images,
    );
    expect(await readdir(dir)).toHaveLength(2);
    await rm(path.join(dir, getDisplayImageFileName(images[0].url, "small")!));
    expect(await displayImagesExist("small", images, dir)).toBe(false);
    expect(
      await (
        await createThumbnailInventory(dir)
      ).hasDisplayImages("small", images),
    ).toBe(false);
  });

  it("keeps HDR/media and alpha sources on the original path", async () => {
    const dir = await directory();
    const source = sharp({
      create: { width: 64, height: 48, channels: 3, background: "red" },
    });
    expect(
      await generateDisplayImages(source, "hdr", dir, {
        preserveOriginal: true,
      }),
    ).toEqual([]);
    const alpha = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0.2 },
      },
    })
      .png()
      .toBuffer();
    expect(await generateDisplayImages(sharp(alpha), "alpha", dir)).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
    expect(await displayImagesExist("hdr", [], dir)).toBe(true);
    expect(await displayImagesExist("old", undefined, dir)).toBe(false);
  });

  it("rejects unsafe or foreign artifact URLs and symlinks", async () => {
    const dir = await directory();
    const source = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .jpeg()
      .toBuffer();
    const images = await generateDisplayImages(sharp(source), "safe", dir);
    const name = getDisplayImageFileName(images[0].url, "safe")!;
    for (const url of [
      `https://evil.test/thumbnails/${name}`,
      `/other/${name}`,
      `/thumbnails/..%2F${name}`,
      `/thumbnails/${name}%5C..`,
      `/thumbnails/${name}%00`,
    ]) {
      expect(getDisplayImageFileName(url, "safe")).toBeNull();
    }
    await rm(path.join(dir, name));
    await symlink("/etc/hosts", path.join(dir, name));
    expect(await displayImagesExist("safe", images, dir)).toBe(false);
    expect(
      await (
        await createThumbnailInventory(dir)
      ).hasDisplayImages("safe", images),
    ).toBe(false);
  });
});
