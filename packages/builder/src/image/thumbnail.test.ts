import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createThumbnailFileName,
  createThumbnailInventory,
  getThumbnailPublicUrl,
  resolveExistingThumbnail,
  THUMBNAIL_ENCODING_VERSION,
} from "./thumbnail.js";

describe("thumbnail URL helpers", () => {
  it("encodes generated thumbnail filenames for public URLs", () => {
    expect(getThumbnailPublicUrl("album #1?50%")).toBe(
      "/thumbnails/album%20%231%3F50%25.jpg",
    );
  });

  it("content-addresses immutable generated thumbnails", () => {
    const buffer = Buffer.from("encoded jpeg");
    const fileName = createThumbnailFileName("photo", buffer);

    expect(fileName).toMatch(
      new RegExp(
        `^photo\\.[\\da-f]{64}\\.${THUMBNAIL_ENCODING_VERSION}\\.jpg$`,
      ),
    );
    expect(getThumbnailPublicUrl("photo", buffer)).toBe(
      `/thumbnails/${fileName}`,
    );
    expect(createThumbnailFileName("photo", Buffer.from("changed"))).not.toBe(
      fileName,
    );
  });

  it("does not choose an arbitrary addressed file when a CDN URL hides the basename", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-thumbnail-"),
    );
    try {
      const first = createThumbnailFileName("photo", Buffer.from("first"));
      const second = createThumbnailFileName("photo", Buffer.from("second"));
      await Promise.all([
        fs.writeFile(path.join(directory, first), "first"),
        fs.writeFile(path.join(directory, second), "second"),
      ]);

      await expect(
        resolveExistingThumbnail(
          "photo",
          directory,
          "https://cdn.example.com/assets/rewritten-name.jpg",
        ),
      ).resolves.toBeNull();
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  });

  it("only reuses regular thumbnail files", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-thumbnail-"),
    );
    try {
      await fs.mkdir(path.join(directory, "photo.jpg"));
      await expect(
        resolveExistingThumbnail("photo", directory, "/thumbnails/photo.jpg"),
      ).resolves.toBeNull();
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  });

  it.each(["addressed", "legacy"])(
    "does not substitute a stale %s cache for a missing published thumbnail",
    async (cachedKind) => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "afilmory-thumbnail-missing-"),
      );
      try {
        const publishedBuffer = Buffer.from("published pixels");
        const publishedName = createThumbnailFileName("photo", publishedBuffer);
        const publishedUrl = getThumbnailPublicUrl("photo", publishedBuffer);
        const staleName =
          cachedKind === "legacy"
            ? "photo.jpg"
            : createThumbnailFileName("photo", Buffer.from("old pixels"));
        await fs.writeFile(path.join(directory, staleName), "old pixels");

        const inventory = await createThumbnailInventory(directory);
        expect(inventory.has("photo", publishedUrl)).toBe(false);
        await expect(
          resolveExistingThumbnail("photo", directory, publishedUrl),
        ).resolves.toBeNull();

        await fs.writeFile(
          path.join(directory, publishedName),
          publishedBuffer,
        );
        const repairedInventory = await createThumbnailInventory(directory);
        expect(repairedInventory.has("photo", publishedUrl)).toBe(true);
        await expect(
          resolveExistingThumbnail("photo", directory, publishedUrl),
        ).resolves.toMatchObject({
          fileName: publishedName,
          url: publishedUrl,
        });
      } finally {
        await fs.rm(directory, { force: true, recursive: true });
      }
    },
  );

  it("builds one ambiguity-safe inventory for rewritten CDN URLs", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-thumbnail-inventory-"),
    );
    try {
      const single = createThumbnailFileName("single", Buffer.from("one"));
      const first = createThumbnailFileName("ambiguous", Buffer.from("first"));
      const second = createThumbnailFileName(
        "ambiguous",
        Buffer.from("second"),
      );
      await Promise.all(
        [single, first, second].map((name) =>
          fs.writeFile(path.join(directory, name), name),
        ),
      );

      const inventory = await createThumbnailInventory(directory);
      expect(
        inventory.has("single", "https://cdn.example.com/assets/rewritten.jpg"),
      ).toBe(true);
      expect(
        inventory.has(
          "ambiguous",
          "https://cdn.example.com/assets/rewritten.jpg",
        ),
      ).toBe(false);
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  });
});
