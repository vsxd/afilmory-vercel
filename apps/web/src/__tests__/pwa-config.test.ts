import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteConfig } from "../../../../site.config";
import {
  createAfilmoryPwaPlugin,
  createNavigateFallbackDenylist,
  matchGalleryIndexRequest,
  matchImageRequest,
  matchManifestShardRequest,
  matchThumbnailRequest,
} from "../../plugins/vite/pwa";
import { AFILMORY_RUNTIME_CACHE_NAMES } from "../runtime/cache-names";

const { vitePwa } = vi.hoisted(() => ({
  vitePwa: vi.fn((options: unknown) => options),
}));

vi.mock("vite-plugin-pwa", () => ({ VitePWA: vitePwa }));

const siteConfig: SiteConfig = {
  name: "Gallery",
  title: "Gallery",
  description: "Photos",
  url: "https://example.com",
  accentColor: "#123456",
  author: { name: "Author", url: "https://example.com" },
};

function request(destination: RequestDestination): Request {
  return { destination } as Request;
}

describe("PWA runtime caching", () => {
  beforeEach(() => vitePwa.mockClear());

  it("matches media by pathname even when URLs have query strings", () => {
    expect(
      matchThumbnailRequest({
        url: new URL("https://example.com/thumbnails/hash.jpg?signature=abc"),
      }),
    ).toBe(true);
    expect(
      matchImageRequest({
        url: new URL("https://cdn.example.com/original.HIF?download=1"),
        request: request(""),
      }),
    ).toBe(true);
  });

  it("matches stable hash-prefix detail shard names", () => {
    expect(
      matchManifestShardRequest({
        url: new URL(
          "/assets/photo-details.101.0123456789.json",
          window.location.origin,
        ),
      }),
    ).toBe(true);
  });

  it("runtime-caches only same-origin content-addressed gallery indexes", () => {
    for (const [url, expected] of [
      ["/assets/gallery-index.1234abcd.json", true],
      ["/assets/gallery-index.1234abcd.json?version=1", true],
      ["/assets/gallery-index.json", false],
      ["/assets/photo-details.root.1234abcd.json", false],
      ["https://other.example/assets/gallery-index.1234abcd.json", false],
    ] as const) {
      expect(
        matchGalleryIndexRequest({ url: new URL(url, window.location.origin) }),
      ).toBe(expected);
    }
  });

  it("bounds gallery cache separately from details and delegates precache sizing to the transform", () => {
    createAfilmoryPwaPlugin(siteConfig);
    const options = vitePwa.mock.calls[0]?.[0] as {
      workbox: {
        maximumFileSizeToCacheInBytes: number;
        runtimeCaching: Array<{
          urlPattern: unknown;
          options: {
            cacheName: string;
            expiration: { maxEntries: number; purgeOnQuotaError: boolean };
            cacheableResponse: { statuses: number[] };
          };
        }>;
      };
    };
    const galleryRoute = options.workbox.runtimeCaching.find(
      (route) => route.urlPattern === matchGalleryIndexRequest,
    );
    expect(galleryRoute?.options).toMatchObject({
      cacheName: AFILMORY_RUNTIME_CACHE_NAMES.galleryIndexes,
      expiration: { maxEntries: 2, purgeOnQuotaError: true },
      cacheableResponse: { statuses: [200] },
    });
    expect(options.workbox.maximumFileSizeToCacheInBytes).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not claim an unfillable video cache and excludes photo shells from precache", () => {
    createAfilmoryPwaPlugin(siteConfig);
    const options = vitePwa.mock.calls[0]?.[0] as {
      workbox: {
        globIgnores: string[];
        navigateFallbackDenylist: RegExp[];
        runtimeCaching: Array<{
          options?: { cacheName?: string };
        }>;
      };
    };
    const configuredCacheNames = options.workbox.runtimeCaching.map(
      (route) => route.options?.cacheName,
    );

    expect(configuredCacheNames).toEqual(
      expect.arrayContaining(Object.values(AFILMORY_RUNTIME_CACHE_NAMES)),
    );
    expect(configuredCacheNames).not.toContain("afilmory-videos-v1");
    expect(options.workbox.globIgnores).toContain("photos/**/index.html");
    expect(
      options.workbox.navigateFallbackDenylist.some((pattern) =>
        pattern.test("/photos/photo-1/"),
      ),
    ).toBe(true);
  });

  it("keeps static documents, media, and custom local originals out of SPA navigation fallback", () => {
    const denylist = createNavigateFallbackDenylist("/media/originals");
    const isDenied = (pathname: string) =>
      denylist.some((pattern) => pattern.test(pathname));

    expect(isDenied("/photos/photo-1/")).toBe(true);
    expect(isDenied("/media/originals/trip/photo.jpg")).toBe(true);
    expect(isDenied("/feed.xml")).toBe(true);
    expect(isDenied("/feed.xml?cache-bust=1")).toBe(true);
    expect(isDenied("/sitemap.xml")).toBe(true);
    expect(isDenied("/manifest.webmanifest?v=2")).toBe(true);
    expect(isDenied("/sw.js?v=2")).toBe(true);
    expect(isDenied("/assets/app.js")).toBe(true);
    expect(isDenied("/photo.jpg?download=1")).toBe(true);
    expect(isDenied("/photos?source=share")).toBe(true);
    expect(isDenied("/media/originals?listing=1")).toBe(true);
    expect(isDenied("/map")).toBe(false);
    expect(isDenied("/map?region=asia")).toBe(false);
  });
});
