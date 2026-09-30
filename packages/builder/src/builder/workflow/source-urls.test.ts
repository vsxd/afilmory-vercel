import { describe, expect, it, vi } from "vitest";

import { generateS3PublicUrl } from "../../storage/providers/s3-provider.js";
import type { ManifestSource } from "../../types/manifest.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import { refreshCachedSourceUrls } from "./source-urls.js";

describe("cached source URLs", () => {
  it.each([
    { provider: "s3", bucket: "old", customDomain: "https://old.example" },
    {
      provider: "s3",
      bucket: "old",
      endpoint: "https://store.example",
      forcePathStyle: true,
    },
    {
      provider: "s3",
      bucket: "old",
      endpoint: "https://store.example",
      forcePathStyle: false,
    },
  ] as const)(
    "refreshes original and Live Photo URLs from %j",
    async (previousConfig) => {
      const photo = {
        s3Key: "trip/photo 1.jpg",
        originalUrl: generateS3PublicUrl(previousConfig, "trip/photo 1.jpg"),
        video: {
          type: "live-photo",
          s3Key: "trip/photo 1.mov",
          videoUrl: generateS3PublicUrl(previousConfig, "trip/photo 1.mov"),
        },
      } as PhotoManifestItem;
      const previousSource: ManifestSource = { ...previousConfig };
      // The historical disk schema omits this option.
      delete (previousSource as { forcePathStyle?: boolean }).forcePathStyle;
      const config = {
        provider: "s3",
        bucket: "new",
        customDomain: "https://new.example",
      } as const;
      await refreshCachedSourceUrls([photo], previousSource, config, {
        generatePublicUrl: async (key) => generateS3PublicUrl(config, key),
      });
      expect(photo.originalUrl).toBe("https://new.example/trip/photo%201.jpg");
      expect(photo.video).toMatchObject({
        videoUrl: "https://new.example/trip/photo%201.mov",
      });
    },
  );

  it("preserves custom plugin URLs and tolerates damaged source descriptors", async () => {
    const photo = {
      s3Key: "photo.jpg",
      originalUrl: "https://plugin.example/custom.jpg",
    } as PhotoManifestItem;
    const generatePublicUrl = vi.fn(
      async () => "https://new.example/photo.jpg",
    );
    for (const source of [
      { provider: "s3", bucket: "old", customDomain: "https://old.example" },
      { provider: "s3", bucket: "old", endpoint: "invalid" },
      { provider: "unknown" },
    ] satisfies ManifestSource[]) {
      await refreshCachedSourceUrls(
        [photo],
        source,
        { provider: "s3", bucket: "new" },
        { generatePublicUrl },
      );
    }
    expect(generatePublicUrl).not.toHaveBeenCalled();
    expect(photo.originalUrl).toBe("https://plugin.example/custom.jpg");
  });

  it("migrates local cached URLs to S3 without changing photo identity", async () => {
    const photo = {
      id: "stable",
      s3Key: "photo.jpg",
      originalUrl: "/originals/photo.jpg",
    } as PhotoManifestItem;
    await refreshCachedSourceUrls(
      [photo],
      { provider: "local", baseUrl: "/originals" },
      { provider: "s3", bucket: "new" },
      {
        generatePublicUrl: async () => "https://new.example/photo.jpg",
      },
    );
    expect(photo).toEqual({
      id: "stable",
      s3Key: "photo.jpg",
      originalUrl: "https://new.example/photo.jpg",
    });
  });
});
