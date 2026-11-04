import type { RefObject } from "react";
import { useEffect } from "react";

import { useAfilmoryRuntime } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

import { PHOTO_VIEWER_FIT_SCALE } from "./animations/utils";
import { selectDisplayImage } from "./display-image";

/** At most two small neighbours, after the current image has finished loading. */
export function useDisplayImagePrefetch(
  photos: readonly PhotoManifest[],
  currentIndex: number,
  enabled: boolean,
  viewportRef?: RefObject<HTMLElement | null>,
) {
  const runtime = useAfilmoryRuntime();
  useEffect(() => {
    if (!enabled) return;
    const { connection } = navigator as Navigator & {
      connection?: { saveData?: boolean };
    };
    if (connection?.saveData) return;
    let cancelled = false;
    let loader:
      ReturnType<typeof runtime.imageLoading.createLoader> | undefined;
    const timer = setTimeout(() => {
      const viewport = viewportRef?.current;
      const targets = [photos[currentIndex + 1], photos[currentIndex - 1]]
        .filter((photo) => photo !== undefined)
        .map((photo) =>
          selectDisplayImage(
            photo,
            {
              width: viewport?.clientWidth || window.innerWidth,
              height: viewport?.clientHeight || window.innerHeight,
              dpr: window.devicePixelRatio,
            },
            PHOTO_VIEWER_FIT_SCALE,
          ),
        );
      void (async () => {
        for (const target of targets) {
          if (cancelled) return;
          // Never speculatively fetch originals for legacy/special-format photos.
          if (!target || runtime.imageCache.has(target.url)) continue;
          loader = runtime.imageLoading.createLoader();
          try {
            const result = await loader.loadImage(target.url, {
              priority: "auto",
            });
            result.release();
          } catch {
            // Prefetch is optional. The active viewer owns fallback and retry.
          } finally {
            runtime.imageLoading.cleanupLoader(loader);
            loader = undefined;
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (loader) runtime.imageLoading.cleanupLoader(loader);
    };
  }, [currentIndex, enabled, photos, runtime, viewportRef]);
}
