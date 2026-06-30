import { describe, expect, it, vi } from "vitest";

import { installCriticalRoutePreloads } from "../critical-route-preload";

describe("critical-route-preload", () => {
  it("preloads the gallery layout route module", async () => {
    const loadGallery = vi.fn().mockResolvedValue({ Component: "gallery" });

    const preload = installCriticalRoutePreloads({
      "./pages/(main)/layout.tsx": loadGallery,
    });

    await preload.ready;

    expect(loadGallery).toHaveBeenCalledTimes(1);
  });

  it("does not block first paint on the photo-detail (viewer) route", async () => {
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
    // viewer 路由不再属于关键预热，首屏渲染不应等待（或触发）它。
    expect(loadPhotoDetail).not.toHaveBeenCalled();
  });

  it("fails bootstrap readiness when the layout route module is missing", () => {
    expect(() => installCriticalRoutePreloads({})).toThrow(
      "Missing critical route module: ./pages/(main)/layout.tsx",
    );
  });
});
