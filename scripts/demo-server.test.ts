import fs from "node:fs/promises";
import path from "node:path";

import { assertManifest } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { createDemoEnvironment, createDemoFixture } from "./demo-server";

describe("zero-credential demo", () => {
  it("uses the committed synthetic fixture without inheriting repository secrets", () => {
    const environment = createDemoEnvironment(
      "/tmp/demo/photos-manifest.json",
      {
        PATH: "/bin",
        REPO_TOKEN: "must-not-pass-through",
        S3_SECRET_ACCESS_KEY: "must-not-pass-through",
        LOCAL_PHOTOS_PATH: "/private-photos",
      },
    );
    expect(environment.PHOTO_STORAGE_PROVIDER).toBe("local");
    expect(environment.AFILMORY_MANIFEST_PATH).toBe(
      "/tmp/demo/photos-manifest.json",
    );
    expect(environment.LOCAL_PHOTOS_PATH).toContain(
      "apps/web/e2e/fixtures/thumbnails",
    );
    expect(environment.REPO_TOKEN).toBeUndefined();
    expect(environment.S3_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("serves every demo photo and video from local fixtures without changing the committed manifest", async () => {
    const sourcePath = path.resolve(
      "apps/web/e2e/fixtures/photos-manifest.json",
    );
    const original = await fs.readFile(sourcePath, "utf8");
    const fixture = await createDemoFixture();
    try {
      const manifest = assertManifest(
        JSON.parse(await fs.readFile(fixture.manifestPath, "utf8")),
      );
      const environment = createDemoEnvironment(fixture.manifestPath);
      expect(manifest.photos.length).toBeGreaterThan(0);
      expect(manifest.source).toEqual({
        provider: "local",
        baseUrl: "/originals",
      });
      for (const photo of manifest.photos) {
        const urls = [photo.originalUrl, photo.thumbnailUrl];
        if (photo.video?.type === "live-photo") urls.push(photo.video.videoUrl);
        for (const url of urls) {
          expect(url).toMatch(/^\/originals\/[^/]+\.(?:jpg|webm)$/);
          const mediaFile = path.join(
            environment.LOCAL_PHOTOS_PATH!,
            decodeURIComponent(url.slice("/originals/".length)),
          );
          expect((await fs.stat(mediaFile)).size).toBeGreaterThan(0);
        }
      }
      expect(await fs.readFile(sourcePath, "utf8")).toBe(original);
    } finally {
      await fixture.cleanup();
    }
    await expect(fs.stat(fixture.manifestPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
