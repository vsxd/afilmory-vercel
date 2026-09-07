import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("completes close immediately when no FLIP target is available", () => {
    const onExitComplete = vi.fn();
    const photo = createPhoto("no-target");
    const { rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: null,
          currentPhoto: photo,
          currentBlobSrc: null,
          isMobile: false,
          onExitComplete,
        }),
      { initialProps: { isOpen: true } },
    );
    expect(onExitComplete).not.toHaveBeenCalled();
    rerender({ isOpen: false });
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    rerender({ isOpen: false });
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("waits for the FLIP completion event before completing close", () => {
    const onExitComplete = vi.fn();
    const photo = createPhoto("virtual");
    setGalleryVirtualPhotoTargetResolver(() => ({
      left: 10,
      top: 10,
      width: 100,
      height: 80,
      borderRadius: 0,
    }));
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: null,
          currentPhoto: photo,
          currentBlobSrc: null,
          isMobile: false,
          onExitComplete,
        }),
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });
    expect(result.current.exitTransition).not.toBeNull();
    expect(onExitComplete).not.toHaveBeenCalled();
    act(() => result.current.handleExitAnimationComplete());
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores an old animation completion after another close starts", () => {
    const onExitComplete = vi.fn();
    const photo = createPhoto("virtual");
    setGalleryVirtualPhotoTargetResolver(() => ({
      left: 10,
      top: 10,
      width: 100,
      height: 80,
      borderRadius: 0,
    }));
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: null,
          currentPhoto: photo,
          currentBlobSrc: null,
          isMobile: false,
          onExitComplete,
        }),
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });
    const obsolete = result.current.handleExitAnimationComplete;
    rerender({ isOpen: true });
    rerender({ isOpen: false });
    act(() => obsolete());
    expect(onExitComplete).not.toHaveBeenCalled();
    expect(result.current.exitTransition).not.toBeNull();
    act(() => result.current.handleExitAnimationComplete());
    expect(onExitComplete).toHaveBeenCalledTimes(1);
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
