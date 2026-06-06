import { createManifest } from "@afilmory/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AfilmoryBrowserRuntime } from "~/runtime/browser-runtime";

import { loadManifestRuntime } from "../manifest-runtime";

const originalFetch = globalThis.fetch;

describe("loadManifestRuntime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (
      globalThis as typeof globalThis & {
        __AFILMORY__?: AfilmoryBrowserRuntime;
      }
    ).__AFILMORY__;
    globalThis.fetch = originalFetch;
  });

  it("returns the injected inline manifest without fetching", async () => {
    (
      globalThis as typeof globalThis & {
        __AFILMORY__?: AfilmoryBrowserRuntime;
      }
    ).__AFILMORY__ = {
      version: 1,
      manifest: {
        mode: "inline",
        data: createManifest({ photos: [{ id: "1", tags: [] } as never] }),
      },
    };
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    const manifest = await loadManifestRuntime();

    expect(manifest.photos).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the prestarted manifest promise when available", async () => {
    (
      globalThis as typeof globalThis & {
        __AFILMORY__?: AfilmoryBrowserRuntime;
      }
    ).__AFILMORY__ = {
      version: 1,
      manifest: {
        mode: "external",
        url: "/assets/photos-manifest.json",
        promise: Promise.resolve(
          createManifest({ photos: [{ id: "2", tags: [] } as never] }),
        ),
      },
    };

    const manifest = await loadManifestRuntime();

    expect(manifest.photos[0]?.id).toBe("2");
  });

  it("fetches the external manifest when only a URL is injected", async () => {
    (
      globalThis as typeof globalThis & {
        __AFILMORY__?: AfilmoryBrowserRuntime;
      }
    ).__AFILMORY__ = {
      version: 1,
      manifest: {
        mode: "external",
        url: "/assets/photos-manifest.json",
      },
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        createManifest({ photos: [{ id: "3", tags: [] } as never] }),
    });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    const manifest = await loadManifestRuntime();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/assets/photos-manifest.json",
      expect.any(Object),
    );
    expect(manifest.photos[0]?.id).toBe("3");
  });

  it("clears the cached promise after a failed fetch so retries can succeed", async () => {
    (
      globalThis as typeof globalThis & {
        __AFILMORY__?: AfilmoryBrowserRuntime;
      }
    ).__AFILMORY__ = {
      version: 1,
      manifest: {
        mode: "external",
        url: "/assets/photos-manifest.json",
      },
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createManifest({ photos: [{ id: "4", tags: [] } as never] }),
      });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    await expect(loadManifestRuntime()).rejects.toThrow(
      "Manifest request failed: 503 Unavailable",
    );
    const manifest = await loadManifestRuntime();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(manifest.photos[0]?.id).toBe("4");
  });
});
