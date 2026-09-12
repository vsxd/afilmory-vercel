import type { RefObject } from "react";
import { useEffect } from "react";

/** Refit after mobile layout changes without remounting or reloading the image. */
export function useMediaViewportRefit(
  viewportRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  refit: () => void,
) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;

    let width = viewport.clientWidth;
    let height = viewport.clientHeight;
    // Also refit when crossing from desktop into the mobile layout: its first
    // observer notification already contains the new dimensions.
    let frame = requestAnimationFrame(refit);
    const observer = new ResizeObserver(() => {
      const nextWidth = viewport.clientWidth;
      const nextHeight = viewport.clientHeight;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      cancelAnimationFrame(frame);
      // The WebGL canvas observes the same resize. Let its backing geometry
      // settle before asking either renderer to fit the new media viewport.
      frame = requestAnimationFrame(refit);
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, refit, viewportRef]);
}
