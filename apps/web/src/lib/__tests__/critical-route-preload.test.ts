import { describe, expect, it, vi } from "vitest";

import { installCriticalRoutePreloads } from "../critical-route-preload";

describe("critical-route-preload", () => {
  it("preloads the gallery layout route module", async () => {
    const loadGallery = vi.fn().mockResolvedValue({ Component: "gallery" });

    await installCriticalRoutePreloads({
      "./pages/(main)/layout.tsx": loadGallery,
    });

    expect(loadGallery).toHaveBeenCalledTimes(1);
  });

  it("does not block first paint on the photo-detail (viewer) route", async () => {
    const loadGallery = vi.fn().mockResolvedValue({ Component: "gallery" });
    const loadPhotoDetail = vi
      .fn()
      .mockResolvedValue({ Component: "photo-detail" });

    await installCriticalRoutePreloads({
      "./pages/(main)/layout.tsx": loadGallery,
      "./pages/(main)/photos/[photoId]/index.tsx": loadPhotoDetail,
    });

    expect(loadGallery).toHaveBeenCalledTimes(1);
    // viewer 路由不再属于关键预热，首屏渲染不应等待（或触发）它。
    expect(loadPhotoDetail).not.toHaveBeenCalled();
  });

  it("fails bootstrap readiness when the layout route module is missing", () => {
    expect(() => installCriticalRoutePreloads({})).toThrow(
      "Missing critical route module: ./pages/(main)/layout.tsx",
    );
  });

  it.each([
    ["/explore", "./pages/explore/index.tsx"],
    ["/explore/", "./pages/explore/index.tsx"],
    ["/EXPLORE", "./pages/explore/index.tsx"],
    ["/Explore/", "./pages/explore/index.tsx"],
    ["/photos/example/", "./pages/(main)/photos/[photoId]/index.tsx"],
    ["/Photos/CaseSensitiveID", "./pages/(main)/photos/[photoId]/index.tsx"],
  ])(
    "keeps cold %s startup pending until its destination code is ready",
    async (pathname, moduleKey) => {
      let resolveDestination!: () => void;
      const destination = new Promise<void>((resolve) => {
        resolveDestination = resolve;
      });
      const loadMap = vi.fn(() =>
        moduleKey.includes("explore") ? destination : Promise.resolve(),
      );
      const loadViewer = vi.fn(() =>
        moduleKey.includes("photoId") ? destination : Promise.resolve(),
      );
      let ready = false;
      const preloaded = installCriticalRoutePreloads(
        {
          "./pages/(main)/layout.tsx": async () => {},
          "./pages/explore/index.tsx": loadMap,
          "./pages/(main)/photos/[photoId]/index.tsx": loadViewer,
        },
        pathname,
      ).then(() => {
        ready = true;
      });
      await Promise.resolve();
      expect(ready).toBe(false);
      expect(
        moduleKey.includes("explore") ? loadMap : loadViewer,
      ).toHaveBeenCalledOnce();
      expect(
        moduleKey.includes("explore") ? loadViewer : loadMap,
      ).not.toHaveBeenCalled();
      resolveDestination();
      await preloaded;
      expect(ready).toBe(true);
    },
  );
});
