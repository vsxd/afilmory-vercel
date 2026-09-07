import { useEffect } from "react";

import { useAppNavigation, useGallerySettings } from "./hooks";

/** View restoration is separate from navigation and never writes a route. */
export function useGalleryViewport(element: HTMLElement | null) {
  const navigation = useAppNavigation();
  const [settings] = useGallerySettings();
  useEffect(() => {
    if (!element) return;
    const search = navigation.getGallerySearch();
    const saved = navigation.getGalleryPosition(search);
    let restoring = Boolean(saved);
    let focusPhotoId = saved?.focusPhotoId;
    let frame = 0;
    const record = () => {
      if (!restoring && element.isConnected)
        navigation.rememberGalleryPosition(
          search,
          element.scrollTop,
          focusPhotoId,
        );
    };
    const stopRestoring = () => {
      restoring = false;
      observer?.disconnect();
    };
    const restore = () => {
      if (!restoring || !saved) return;
      element.scrollTop = saved.top;
      if (Math.abs(element.scrollTop - saved.top) > 1) return;
      const link = Array.from(
        element.querySelectorAll<HTMLElement>("[data-gallery-photo-link]"),
      ).find((node) => node.dataset.photoId === focusPhotoId);
      if (focusPhotoId && !link) return;
      if (!navigation.isPhotoOpen()) link?.focus({ preventScroll: true });
      stopRestoring();
    };
    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(restore);
          });
    observer?.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    if (saved) frame = requestAnimationFrame(restore);
    else {
      element.scrollTop = 0;
      stopRestoring();
    }
    const focus = (event: FocusEvent) => {
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-gallery-photo-link]")
          : null;
      if (target) {
        focusPhotoId = target.dataset.photoId;
        record();
      }
    };
    element.addEventListener("scroll", record, { passive: true });
    element.addEventListener("focusin", focus);
    element.addEventListener("wheel", stopRestoring, { passive: true });
    element.addEventListener("pointerdown", stopRestoring);
    element.addEventListener("keydown", stopRestoring);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      record();
      element.removeEventListener("scroll", record);
      element.removeEventListener("focusin", focus);
      element.removeEventListener("wheel", stopRestoring);
      element.removeEventListener("pointerdown", stopRestoring);
      element.removeEventListener("keydown", stopRestoring);
    };
  }, [element, navigation, settings]);
}
