import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import { useDisplayImagePrefetch } from "../useDisplayImagePrefetch";

const mock = vi.hoisted(() => ({
  loadImage: vi.fn(),
  release: vi.fn(),
  runtime: {
    imageCache: { has: vi.fn(() => false) },
    imageLoading: { createLoader: vi.fn(), cleanupLoader: vi.fn() },
  },
}));
vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => mock.runtime,
}));

const photo = (id: string, variants = true): PhotoManifest => ({
  id,
  title: "",
  description: "",
  dateTaken: "",
  tags: [],
  originalUrl: `${id}-original.jpg`,
  thumbnailUrl: `${id}-thumb.jpg`,
  thumbHash: null,
  width: 6000,
  height: 4000,
  aspectRatio: 1.5,
  s3Key: id,
  lastModified: "",
  size: 100,
  exif: null,
  toneAnalysis: null,
  location: null,
  displayImages: variants
    ? [{ url: `${id}-display.jpg`, width: 1600, height: 1067 }]
    : undefined,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("display neighbour prefetch", () => {
  it("waits for the active image and only fetches neighbour derivatives", async () => {
    vi.useFakeTimers();
    mock.loadImage.mockResolvedValue({ release: mock.release });
    mock.runtime.imageLoading.createLoader.mockImplementation(() => ({
      loadImage: mock.loadImage,
    }));
    const photos = [photo("legacy", false), photo("current"), photo("next")];
    const { rerender } = renderHook(
      ({ ready }) => useDisplayImagePrefetch(photos, 1, ready),
      { initialProps: { ready: false } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(mock.loadImage).not.toHaveBeenCalled();
    rerender({ ready: true });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(mock.loadImage).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mock.loadImage).toHaveBeenCalledExactlyOnceWith("next-display.jpg", {
      priority: "auto",
    });
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it("cancels the scheduled prefetch when navigation moves before its idle delay", async () => {
    vi.useFakeTimers();
    const photos = [photo("a"), photo("b")];
    const { unmount } = renderHook(() =>
      useDisplayImagePrefetch(photos, 0, true),
    );
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mock.loadImage).not.toHaveBeenCalled();
  });
});
