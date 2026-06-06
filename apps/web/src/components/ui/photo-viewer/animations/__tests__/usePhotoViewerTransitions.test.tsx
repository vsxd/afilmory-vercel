import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GalleryVirtualPhotoTargetRect } from "~/lib/gallery-virtual-target";
import { setGalleryVirtualPhotoTargetResolver } from "~/lib/gallery-virtual-target";
import type { PhotoManifest } from "~/types/photo";

import { usePhotoViewerTransitions } from "../usePhotoViewerTransitions";

const createPhoto = (id: string): PhotoManifest =>
  ({
    id,
    title: id,
    originalUrl: `/photos/${id}.jpg`,
    thumbnailUrl: `/thumbnails/${id}.jpg`,
    thumbHash: null,
    width: 6000,
    height: 4000,
  }) as PhotoManifest;

describe("usePhotoViewerTransitions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    setGalleryVirtualPhotoTargetResolver(null);
  });

  it("uses a virtual masonry rect instead of a stale opening trigger when closing far from the original photo", async () => {
    const staleTrigger = document.createElement("div");
    staleTrigger.dataset.photoId = "opening-photo";
    document.body.append(staleTrigger);

    const virtualRect: GalleryVirtualPhotoTargetRect = {
      left: 120,
      top: 2400,
      width: 320,
      height: 220,
      borderRadius: 0,
    };
    setGalleryVirtualPhotoTargetResolver((photoId) =>
      photoId === "current-photo" ? virtualRect : null,
    );

    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: staleTrigger,
          currentPhoto: createPhoto("current-photo"),
          currentBlobSrc: null,
          isMobile: false,
        }),
      {
        initialProps: { isOpen: true },
      },
    );

    rerender({ isOpen: false });

    await waitFor(() => {
      expect(result.current.exitTransition?.to).toEqual(virtualRect);
    });
  });

  it("does not fall back to a stale opening trigger for a different current photo", async () => {
    const staleTrigger = document.createElement("div");
    staleTrigger.dataset.photoId = "opening-photo";
    document.body.append(staleTrigger);

    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: staleTrigger,
          currentPhoto: createPhoto("current-photo"),
          currentBlobSrc: null,
          isMobile: false,
        }),
      {
        initialProps: { isOpen: true },
      },
    );

    rerender({ isOpen: false });

    await waitFor(() => {
      expect(result.current.exitTransition).toBeNull();
    });
  });
});
