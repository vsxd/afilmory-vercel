import { readFileSync } from "node:fs";
import path from "node:path";

import type { AfilmoryManifest } from "@afilmory/schema";
import { createManifest } from "@afilmory/schema";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manifest: AfilmoryManifest = createManifest();

describe("bootstrap splash", () => {
  const roots: Root[] = [];
  let settleBootstrap: (() => Promise<void>) | undefined;

  beforeEach(() => {
    settleBootstrap = undefined;
    vi.resetModules();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("__AFILMORY__", {
      version: 1,
      config: {
        site: {
          title: "Test Lens",
          description: "Loading test photos",
        },
      },
    });
    document.body.innerHTML = "";
  });

  afterEach(async () => {
    await act(async () => {
      await settleBootstrap?.();
      // main creates its own React root, which testing-library cannot track.
      for (const root of roots.splice(0)) root.unmount();
    });
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("keeps the static loading state outside the React root", () => {
    const html = readFileSync(
      path.join(process.cwd(), "apps/web/index.html"),
      "utf-8",
    );
    const splashIndex = html.indexOf('id="splash-screen"');
    const rootIndex = html.indexOf('id="root"');

    expect(splashIndex).toBeGreaterThan(-1);
    expect(rootIndex).toBeGreaterThan(-1);
    expect(splashIndex).toBeLessThan(rootIndex);
    expect(html).toContain("afilmory:startup-metrics:v1");
    expect(html).toContain('rel="preload"');
    expect(html).toContain('href="/src/assets/fonts/GeistVF.woff2"');
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("logoFade");
    expect(html).not.toContain("titleFade");
    expect(html).not.toContain("subtitleFade");
    expect(html).not.toContain("loaderFade");
  });

  it("keeps splash visible while the manifest bootstrap is still pending", async () => {
    let resolveManifest!: (value: AfilmoryManifest) => void;
    const manifestPromise = new Promise<AfilmoryManifest>((resolve) => {
      resolveManifest = resolve;
    });
    let resolveCriticalRoutes!: () => void;
    const criticalRoutesPromise = new Promise<void>((resolve) => {
      resolveCriticalRoutes = resolve;
    });
    const createAppRuntime = vi.fn((options) => ({
      browser: window.__AFILMORY__,
      bodyScrollLock: {
        lock: vi.fn(() => vi.fn()),
        reset: vi.fn(),
      },
      dispose: vi.fn(),
      imageCache: {
        clear: vi.fn(),
      },
      photoRepository: {
        getPhotos: () => options.manifest.photos,
      },
      store: {},
    }));
    const createAppRouter = vi.fn(() => ({}));
    const markStartup = vi.fn();
    const flushStartupMetrics = vi.fn();
    const installCriticalRoutePreloads = vi.fn(() => criticalRoutesPromise);
    const idleCallbacks: IdleRequestCallback[] = [];
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    const loadPhotoViewer = vi.fn(() => ({ default: () => null }));
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);

    vi.doMock("react-dom/client", async (importOriginal) => {
      const original =
        await importOriginal<typeof import("react-dom/client")>();
      return {
        ...original,
        createRoot: (...args: Parameters<typeof original.createRoot>) => {
          const root = original.createRoot(...args);
          roots.push(root);
          return root;
        },
      };
    });
    // The viewer dependency graph is outside this bootstrap/splash contract;
    // still execute its scheduled import and await its completion explicitly.
    vi.doMock("../pages/(main)/photos/[photoId]/index.tsx", loadPhotoViewer);

    vi.doMock("../data-runtime/manifest-runtime", () => ({
      loadManifestRuntime: vi.fn(() => manifestPromise),
    }));
    vi.doMock("../runtime/app-runtime", () => ({
      createAppRuntime,
    }));
    vi.doMock("../lib/critical-route-preload", () => ({
      installCriticalRoutePreloads,
    }));
    vi.doMock("../router", () => ({
      createAppRouter,
    }));
    vi.doMock("react-router", () => ({
      RouterProvider: () => <div data-testid="router-app">Gallery ready</div>,
    }));

    window.__AFILMORY__ = {
      version: 1,
      startup: {
        marks: [],
        markedNames: [],
        mark: markStartup,
        flush: flushStartupMetrics,
        snapshot: vi.fn(),
      },
    };
    document.body.innerHTML =
      '<div id="splash-screen" role="status" aria-label="Loading">Static splash</div><div id="root"></div>';

    let importPromise!: Promise<unknown>;
    const flushIdlePreloads = async () => {
      for (const callback of idleCallbacks.splice(0)) {
        callback({ didTimeout: false, timeRemaining: () => 50 });
      }
      await vi.dynamicImportSettled();
    };
    settleBootstrap = async () => {
      // Also release pending test promises if an earlier assertion fails.
      resolveManifest(manifest);
      resolveCriticalRoutes();
      await importPromise;
      await flushIdlePreloads();
    };
    await act(async () => {
      importPromise = import("../main");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("status", { name: "Loading" })).not.toBeNull();
    expect(screen.queryByTestId("router-app")).toBeNull();
    expect(createAppRuntime).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(markStartup).toHaveBeenCalledWith("manifest-start", undefined);
    });

    await act(async () => {
      resolveManifest(manifest);
      await Promise.resolve();
    });

    expect(createAppRuntime).not.toHaveBeenCalled();
    expect(screen.queryByTestId("router-app")).toBeNull();

    await act(async () => {
      resolveCriticalRoutes();
      await importPromise;
    });

    expect(createAppRuntime).toHaveBeenCalledWith({ manifest });
    expect(createAppRouter).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("router-app")).not.toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
    });
    expect(markStartup).toHaveBeenCalledWith("manifest-ready", { photos: 0 });
    expect(markStartup).toHaveBeenCalledWith(
      "critical-routes-start",
      undefined,
    );
    expect(markStartup).toHaveBeenCalledWith(
      "critical-routes-ready",
      undefined,
    );
    expect(markStartup).toHaveBeenCalledWith(
      "photo-repository-ready",
      undefined,
    );
    expect(markStartup).toHaveBeenCalledWith("react-render-start", undefined);
    expect(markStartup).toHaveBeenCalledWith("app-commit", undefined);
    expect(markStartup).toHaveBeenCalledWith("splash-removed", {
      via: "timeout",
    });
    expect(flushStartupMetrics).toHaveBeenCalledWith("splash-removed");
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    expect(loadPhotoViewer).not.toHaveBeenCalled();
    await act(flushIdlePreloads);
    expect(loadPhotoViewer).toHaveBeenCalledOnce();
  });
});
