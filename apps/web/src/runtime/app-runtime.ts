import type { AfilmoryManifest } from "@afilmory/schema";
import { createStore } from "jotai";
import { createContext, use } from "react";

import { PhotoRepository } from "~/data-runtime/photo-repository";
import type { RegularImageCache } from "~/lib/image-cache-service";
import { createRegularImageCache } from "~/lib/image-cache-service";
import { ImageLoaderManager } from "~/lib/image-loader-manager";

import type { AfilmoryBrowserRuntime } from "./browser-runtime";
import { ensureBrowserRuntime } from "./browser-runtime";

class BodyScrollLockManager {
  private lockCount = 0;
  private overflowBeforeLock: string | null = null;

  lock(): () => void {
    if (typeof document === "undefined") {
      return () => {};
    }

    if (this.lockCount === 0) {
      this.overflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    this.lockCount += 1;

    return () => this.unlock();
  }

  reset(): void {
    if (typeof document !== "undefined" && this.lockCount > 0) {
      document.body.style.overflow = this.overflowBeforeLock ?? "";
    }
    this.lockCount = 0;
    this.overflowBeforeLock = null;
  }

  private unlock(): void {
    if (typeof document === "undefined") {
      return;
    }

    this.lockCount = Math.max(0, this.lockCount - 1);
    if (this.lockCount === 0) {
      document.body.style.overflow = this.overflowBeforeLock ?? "";
      this.overflowBeforeLock = null;
    }
  }
}

export interface ImageLoadingService {
  createLoader: () => ImageLoaderManager;
  cleanupLoader: (loader: ImageLoaderManager) => void;
  cleanupAll: () => void;
}

class RuntimeImageLoadingService implements ImageLoadingService {
  private readonly loaders = new Set<ImageLoaderManager>();

  constructor(private readonly imageCache: RegularImageCache) {}

  createLoader(): ImageLoaderManager {
    const loader = new ImageLoaderManager(this.imageCache);
    this.loaders.add(loader);
    return loader;
  }

  cleanupLoader(loader: ImageLoaderManager): void {
    loader.cleanup();
    this.loaders.delete(loader);
  }

  cleanupAll(): void {
    for (const loader of this.loaders) {
      loader.cleanup();
    }
    this.loaders.clear();
  }
}

export type AppRuntime = {
  bodyScrollLock: BodyScrollLockManager;
  browser: AfilmoryBrowserRuntime;
  criticalRoutePreloadCleanup?: () => void;
  imageCache: RegularImageCache;
  imageLoading: ImageLoadingService;
  photoRepository: PhotoRepository;
  store: ReturnType<typeof createStore>;
  dispose: () => void;
};

export function createAppRuntime({
  browserRuntime = ensureBrowserRuntime(),
  manifest,
}: {
  browserRuntime?: AfilmoryBrowserRuntime;
  manifest: AfilmoryManifest;
}): AppRuntime {
  const bodyScrollLock = new BodyScrollLockManager();
  const imageCache = createRegularImageCache();
  const imageLoading = new RuntimeImageLoadingService(imageCache);

  return {
    bodyScrollLock,
    browser: browserRuntime,
    imageCache,
    imageLoading,
    photoRepository: new PhotoRepository(manifest),
    store: createStore(),
    dispose() {
      this.criticalRoutePreloadCleanup?.();
      imageLoading.cleanupAll();
      this.imageCache.clear();
      bodyScrollLock.reset();
    },
  };
}

export const AppRuntimeContext = createContext<AppRuntime | null>(null);

export function useAfilmoryRuntime(): AppRuntime {
  const runtime = use(AppRuntimeContext);
  if (!runtime) {
    throw new Error("Afilmory runtime is not initialized.");
  }
  return runtime;
}

export function usePhotoRepository(): PhotoRepository {
  return useAfilmoryRuntime().photoRepository;
}
