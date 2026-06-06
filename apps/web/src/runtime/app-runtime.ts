import type { AfilmoryManifest } from "@afilmory/data";
import { createStore } from "jotai";
import { createContext, use } from "react";

import { PhotoRepository } from "~/data-runtime/photo-repository";

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

export type AppRuntime = {
  bodyScrollLock: BodyScrollLockManager;
  browser: AfilmoryBrowserRuntime;
  criticalRoutePreloadCleanup?: () => void;
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

  return {
    bodyScrollLock,
    browser: browserRuntime,
    photoRepository: new PhotoRepository(manifest),
    store: createStore(),
    dispose() {
      this.criticalRoutePreloadCleanup?.();
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
