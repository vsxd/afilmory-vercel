import type { RefObject } from "react";
import { useEffect } from "react";

/** Keep the modal's controls above the mobile keyboard without resizing the gallery. */
export function useCommandViewport(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = ref.current;
    if (!enabled || !viewport || !element) return;
    const update = () => {
      element.style.height = `${viewport.height}px`;
      element.style.top = `${viewport.offsetTop}px`;
      element.style.width = `${viewport.width}px`;
      element.style.left = `${viewport.offsetLeft}px`;
      element.dataset.compactHeight = String(viewport.height < 480);
      element.dataset.shortHeight = String(viewport.height < 340);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      element.style.removeProperty("height");
      element.style.removeProperty("top");
      element.style.removeProperty("width");
      element.style.removeProperty("left");
      delete element.dataset.compactHeight;
      delete element.dataset.shortHeight;
    };
  }, [enabled, ref]);
}
