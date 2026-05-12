import { describe, expect, it, vi } from "vitest";

import { installCriticalRoutePreloads } from "../critical-route-preload";

describe("critical-route-preload", () => {
  it("waits for the gallery and photo detail route modules", async () => {
    const loadGallery = vi.fn().mockResolvedValue({ Component: "gallery" });
    const loadPhotoDetail = vi
      .fn()
      .mockResolvedValue({ Component: "photo-detail" });

    const preload = installCriticalRoutePreloads({
      "./pages/(main)/layout.tsx": loadGallery,
      "./pages/(main)/photos/[photoId]/index.tsx": loadPhotoDetail,
    });

    await preload.ready;

    expect(loadGallery).toHaveBeenCalledTimes(1);
    expect(loadPhotoDetail).toHaveBeenCalledTimes(1);
  });

  it("fails bootstrap readiness when a critical route module is missing", () => {
    expect(() =>
      installCriticalRoutePreloads({
        "./pages/(main)/layout.tsx": vi
          .fn()
          .mockResolvedValue({ Component: "gallery" }),
      }),
    ).toThrow(
      "Missing critical route module: ./pages/(main)/photos/[photoId]/index.tsx",
    );
  });
});
