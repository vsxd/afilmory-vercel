import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MediaLease } from "~/lib/media-resource";

import { useDetailImage } from "../useDetailImage";

const mock = vi.hoisted(() => ({
  loadImage: vi.fn<(src: string) => Promise<MediaLease>>(),
  runtime: {
    imageCache: { delete: vi.fn() },
    imageLoading: { createLoader: vi.fn(), cleanupLoader: vi.fn() },
  },
}));
vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => mock.runtime,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  mock.runtime.imageLoading.createLoader.mockImplementation(() => ({
    loadImage: mock.loadImage,
  }));
  const indicator = {
    current: { resetLoadingState: vi.fn(), updateLoadingState: vi.fn() },
  };
  const hook = renderHook(
    ({ active }) => useDetailImage("original.jpg", active, indicator),
    { initialProps: { active: true } },
  );
  return { ...hook, indicator };
}

describe("original image detail loading", () => {
  it("waits for zoom, deduplicates requests, and releases the original when leaving", async () => {
    const lease = {
      blob: new Blob(["original"]),
      blobSrc: "blob:original",
      release: vi.fn(),
    };
    mock.loadImage.mockResolvedValue(lease);
    const { result, rerender } = setup();
    expect(mock.loadImage).not.toHaveBeenCalled();
    act(() => {
      result.current.requestDetail();
      result.current.requestDetail();
    });
    await waitFor(() => expect(result.current.lease).toBe(lease));
    expect(mock.loadImage).toHaveBeenCalledOnce();
    rerender({ active: false });
    expect(lease.release).toHaveBeenCalledOnce();
    expect(result.current.lease).toBeNull();
    rerender({ active: true });
    expect(mock.loadImage).toHaveBeenCalledOnce();
  });

  it("offers retry after an original failure without invalidating the displayed preview", async () => {
    const lease = {
      blob: new Blob(["original"]),
      blobSrc: "blob:original",
      release: vi.fn(),
    };
    mock.loadImage
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(lease);
    const { result, indicator } = setup();
    act(() => result.current.requestDetail());
    await waitFor(() =>
      expect(indicator.current.updateLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          onRetry: expect.any(Function),
        }),
      ),
    );
    expect(result.current.lease).toBeNull();
    const retry =
      indicator.current.updateLoadingState.mock.calls.at(-1)![0].onRetry;
    act(() => retry());
    await waitFor(() => expect(result.current.lease).toBe(lease));
    expect(mock.loadImage).toHaveBeenCalledTimes(2);
    expect(mock.runtime.imageCache.delete).toHaveBeenCalledExactlyOnceWith(
      "original.jpg",
    );
  });

  it("releases a late original result instead of publishing it after navigation", async () => {
    const pending = Promise.withResolvers<MediaLease>();
    mock.loadImage.mockReturnValue(pending.promise);
    const { result, rerender } = setup();
    act(() => result.current.requestDetail());
    rerender({ active: false });
    const lease = {
      blob: new Blob(["original"]),
      blobSrc: "blob:late",
      release: vi.fn(),
    };
    await act(async () => pending.resolve(lease));
    expect(lease.release).toHaveBeenCalledOnce();
    expect(result.current.lease).toBeNull();
  });

  it("retries a decoded-source failure with a new request even when the original Blob is cached", async () => {
    const lease = {
      blob: new Blob(["original"]),
      blobSrc: "blob:original",
      release: vi.fn(),
    };
    const retryDownload = Promise.withResolvers<MediaLease>();
    mock.loadImage
      .mockResolvedValueOnce(lease)
      .mockReturnValueOnce(retryDownload.promise);
    const { result, indicator, rerender } = setup();
    act(() => result.current.requestDetail());
    await waitFor(() => expect(result.current.lease).toBe(lease));
    const lateFailure = result.current.reportFailure;
    act(() => result.current.reportFailure(new Error("Texture upload failed")));
    expect(result.current.lease).toBeNull();
    expect(result.current.hasError).toBe(true);
    const retry =
      indicator.current.updateLoadingState.mock.calls.at(-1)![0].onRetry;
    act(() => retry());
    expect(result.current.lease).toBeNull();
    expect(lease.release).toHaveBeenCalledOnce();
    await act(async () => retryDownload.resolve(lease));
    expect(result.current.lease?.blob).toBe(lease.blob);
    expect(result.current.hasError).toBe(false);
    expect(mock.loadImage).toHaveBeenCalledTimes(2);
    indicator.current.updateLoadingState.mockClear();
    act(() => lateFailure(new Error("Superseded error")));
    expect(indicator.current.updateLoadingState).not.toHaveBeenCalled();
    rerender({ active: false });
    act(() => result.current.reportFailure(new Error("Inactive error")));
    expect(indicator.current.updateLoadingState).not.toHaveBeenCalled();
  });
});
