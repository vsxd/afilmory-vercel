import type { AfilmoryManifest } from "@afilmory/schema";
import { createStore } from "jotai";
import { createContext, use, useSyncExternalStore } from "react";

import { PhotoRepository } from "~/data-runtime/photo-repository";
import type { RegularImageCache } from "~/lib/image-cache-service";
import { createRegularImageCache } from "~/lib/image-cache-service";
import { ImageConversionService } from "~/lib/image-conversion-service";
import { ImageConverterManager } from "~/lib/image-convert";
import { ImageLoaderManager } from "~/lib/image-loader-manager";
import { NavigationController } from "~/navigation/controller";

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

  constructor(
    private readonly imageCache: RegularImageCache,
    private readonly imageConverter: ImageConverterManager,
  ) {}

  createLoader(): ImageLoaderManager {
    // 所有 loader 共享同一个 runtime 级转换管理器：
    // 并发管道与 pending 任务去重在 runtime 内共享（与旧的全局单例行为一致），
    // 但不同 runtime 之间相互隔离，dispose 后随 runtime 一起被回收。
    const loader = new ImageLoaderManager(this.imageCache, {
      imageConversionService: new ImageConversionService(
        this.imageCache,
        this.imageConverter,
      ),
    });
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
  navigation: NavigationController;
  bodyScrollLock: BodyScrollLockManager;
  browser: AfilmoryBrowserRuntime;
  imageCache: RegularImageCache;
  imageConverter: ImageConverterManager;
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
  const navigation = new NavigationController();
  const bodyScrollLock = new BodyScrollLockManager();
  const imageCache = createRegularImageCache();
  const imageConverter = new ImageConverterManager();
  const imageLoading = new RuntimeImageLoadingService(
    imageCache,
    imageConverter,
  );
  const photoRepository = new PhotoRepository(manifest, {
    delivery: browserRuntime.manifest?.delivery,
  });

  return {
    navigation,
    bodyScrollLock,
    browser: browserRuntime,
    imageCache,
    imageConverter,
    imageLoading,
    photoRepository,
    store: createStore(),
    dispose() {
      navigation.dispose();
      imageLoading.cleanupAll();
      this.imageCache.clear();
      photoRepository.dispose();
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

export function usePhotoRepositoryVersion(): number {
  const repository = usePhotoRepository();
  return useSyncExternalStore(
    repository.subscribe,
    repository.getVersion,
    repository.getVersion,
  );
}
