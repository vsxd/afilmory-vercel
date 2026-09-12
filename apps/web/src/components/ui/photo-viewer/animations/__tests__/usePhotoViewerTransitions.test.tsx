import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GalleryVirtualPhotoTargetRect } from "~/lib/gallery-virtual-target";
import { setGalleryVirtualPhotoTargetResolver } from "~/lib/gallery-virtual-target";
import type { PhotoManifest } from "~/types/photo";

import type { DismissTransform } from "../../useDismissGesture";
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("enters the measured media area and closes from its latest layout even before an observer notification", () => {
    const photo = createPhoto("resized-media");
    const trigger = document.createElement("button");
    trigger.dataset.photoId = photo.id;
    const thumbnailRect = new DOMRect(20, 120, 150, 100);
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(thumbnailRect);
    const media = document.createElement("div");
    const measureMedia = vi
      .spyOn(media, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 64, 390, 300));
    document.body.append(trigger, media);
    const mediaRef = { current: media };

    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: trigger,
          currentPhoto: photo,
          currentBlobSrc: null,
          isMobile: true,
          mediaRef,
        }),
      { initialProps: { isOpen: true } },
    );
    expect(result.current.entryTransition?.to).toEqual({
      left: 0,
      top: 84,
      width: 390,
      height: 260,
      borderRadius: 0,
    });
    act(() => result.current.handleEntryAnimationComplete());

    measureMedia.mockReturnValue(new DOMRect(0, 64, 390, 240));
    rerender({ isOpen: false });

    expect(result.current.exitTransition?.from).toEqual({
      left: 15,
      top: 64,
      width: 360,
      height: 240,
      borderRadius: 0,
    });
  });

  it("retains resized media bounds after unmount and refits the current photo rather than reusing entry geometry", () => {
    let notifyResize = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const media = document.createElement("div");
    document.body.append(media);
    const measureMedia = vi
      .spyOn(media, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 64, 390, 600));
    const mediaRef: { current: HTMLElement | null } = { current: media };
    const photo = createPhoto("landscape");
    const portrait = { ...createPhoto("portrait"), width: 4000, height: 6000 };
    setGalleryVirtualPhotoTargetResolver(() => ({
      left: 10,
      top: 20,
      width: 100,
      height: 150,
      borderRadius: 0,
    }));
    const { result, rerender } = renderHook(
      ({ isOpen, currentPhoto }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: null,
          currentPhoto,
          currentBlobSrc: null,
          isMobile: true,
          mediaRef,
        }),
      { initialProps: { isOpen: true, currentPhoto: photo } },
    );
    expect(observe).toHaveBeenCalledWith(media);

    measureMedia.mockReturnValue(new DOMRect(0, 64, 390, 240));
    act(() => notifyResize());
    rerender({ isOpen: true, currentPhoto: portrait });
    mediaRef.current = null;
    media.remove();
    rerender({ isOpen: false, currentPhoto: portrait });

    expect(result.current.exitTransition?.from).toEqual({
      left: 115,
      top: 64,
      width: 160,
      height: 240,
      borderRadius: 0,
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("applies the released drag transform once to the measured contain frame", () => {
    const media = document.createElement("div");
    document.body.append(media);
    vi.spyOn(media, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 64, 390, 240),
    );
    const mediaRef = { current: media };
    const dismissTransformRef: { current: DismissTransform | null } = {
      current: null,
    };
    const photo = createPhoto("dismissed");
    setGalleryVirtualPhotoTargetResolver(() => ({
      left: 10,
      top: 20,
      width: 150,
      height: 100,
      borderRadius: 0,
    }));
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePhotoViewerTransitions({
          isOpen,
          triggerElement: null,
          currentPhoto: photo,
          currentBlobSrc: null,
          isMobile: true,
          mediaRef,
          dismissTransformRef,
        }),
      { initialProps: { isOpen: true } },
    );

    dismissTransformRef.current = { x: 12, y: 40, scale: 0.8, velocity: 650 };
    rerender({ isOpen: false });

    expect(result.current.exitTransition?.from).toEqual({
      left: 63,
      top: 128,
      width: 288,
      height: 192,
      borderRadius: 0,
    });
    expect(result.current.exitTransition?.velocityY).toBe(650);
    expect(dismissTransformRef.current).toBeNull();
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
