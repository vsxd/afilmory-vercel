import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode, RefObject } from "react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaTaskError } from "~/lib/media-task";
import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "~/lib/thumbnail-load-cache";

import type { LoadingIndicatorRef } from "../LoadingIndicator";
import { LoadingIndicator } from "../LoadingIndicator";
import { ProgressiveImage } from "../ProgressiveImage";
import type { LivePhotoVideoHandle } from "../types";

const hoisted = vi.hoisted(() => ({
  canUseWebGL: false,
  supportsHDR: false,
  playLivePhoto: vi.fn(),
  stopLivePhoto: vi.fn(),
  failVideo: false,
  retryVideo: vi.fn(),
  failWebGL: false,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  resetView: vi.fn(),
  loadedUrls: [] as string[],
  webglCallbacks: {} as {
    onImagePainted?: () => void;
    onLoadingStateChange?: (loading: boolean, state?: number) => void;
    previewCache?: unknown;
    onDetailRequested?: () => void;
    onDetailError?: (error: unknown) => void;
    detailSrc?: string;
    detailSourceBlob?: Blob | null;
    viewerSession?: unknown;
  },
  runtime: {
    imagePreviewCache: { cache: "runtime-preview-cache" },
    webGLViewerSession: { session: "runtime-viewer-session" },
    imageCache: { delete: vi.fn() },
    imageLoading: {
      createLoader: vi.fn(() => ({
        loadImage: (src: string) => {
          hoisted.loadedUrls.push(src);
          return Promise.resolve({
            blobSrc: "blob:mock-image",
            release: vi.fn(),
            blob: new Blob(["photo"], { type: "image/jpeg" }),
          });
        },
        cleanup: vi.fn(),
      })),
      cleanupLoader: vi.fn((loader: { cleanup: () => void }) => {
        loader.cleanup();
      }),
    },
  },
}));

vi.mock("@afilmory/ui", () => ({
  Thumbhash: ({
    thumbHash,
    className,
  }: {
    thumbHash: string;
    className?: string;
  }) => (
    <div
      data-testid="photo-detail-thumbhash"
      data-thumbhash={thumbHash}
      className={className}
    />
  ),
  clsxm: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

vi.mock("@afilmory/webgl-viewer", async () => {
  const React = await import("react");

  return {
    LoadingState: { CREATE_TEXTURE: 0, IMAGE_LOADING: 1 },
    WebGLImageViewer: ({
      onError,
      onImagePainted,
      onLoadingStateChange,
      previewCache,
      onDetailRequested,
      onDetailError,
      detailSrc,
      detailSourceBlob,
      viewerSession,
      ref,
    }: {
      onError?: (error: unknown) => void;
      onImagePainted?: () => void;
      onLoadingStateChange?: (loading: boolean, state?: number) => void;
      previewCache?: unknown;
      onDetailRequested?: () => void;
      onDetailError?: (error: unknown) => void;
      detailSrc?: string;
      detailSourceBlob?: Blob | null;
      viewerSession?: unknown;
      ref?: React.RefObject<{
        zoomIn: () => void;
        zoomOut: () => void;
        resetView: () => void;
        getScale: () => number;
      } | null>;
    }) => {
      hoisted.webglCallbacks = {
        onImagePainted,
        onLoadingStateChange,
        previewCache,
        onDetailRequested,
        onDetailError,
        detailSrc,
        detailSourceBlob,
        viewerSession,
      };
      React.useImperativeHandle(ref, () => ({
        zoomIn: hoisted.zoomIn,
        zoomOut: hoisted.zoomOut,
        resetView: hoisted.resetView,
        getScale: () => 1,
      }));
      React.useEffect(() => {
        if (hoisted.failWebGL) {
          onError?.(new Error("WebGL unavailable"));
        }
      }, [onError]);

      return <canvas data-testid="webgl-viewer" />;
    },
  };
});

vi.mock("~/lib/image-loader-manager", () => {
  class MockImageLoaderManager {
    loadImage() {
      return Promise.resolve({
        blobSrc: "blob:mock-image",
        release: vi.fn(),
        blob: new Blob(["photo"], { type: "image/jpeg" }),
      });
    }

    cleanup() {}
  }

  return { ImageLoaderManager: MockImageLoaderManager };
});

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => hoisted.runtime,
}));

vi.mock("motion/react", () => {
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => (
      <>{children}</>
    ),
    useReducedMotion: () => false,
    m: {
      div: ({ children, ...props }: ComponentProps<"div">) => (
        <div {...props}>{children}</div>
      ),
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("usehooks-ts", () => ({
  useMediaQuery: () => hoisted.supportsHDR,
}));

vi.mock("react-zoom-pan-pinch", () => {
  return {
    TransformWrapper: ({ children }: { children?: any }) => (
      <div>{children}</div>
    ),
    TransformComponent: ({ children }: { children?: any }) => (
      <div>{children}</div>
    ),
  };
});

vi.mock("../LivePhotoVideo", async () => {
  const { useEffect, useImperativeHandle } = await import("react");
  return {
    LivePhotoVideo: ({
      ref,
      onPlayingChange,
      loadingIndicatorRef,
    }: {
      ref?: RefObject<LivePhotoVideoHandle | null>;
      onPlayingChange?: (playing: boolean) => void;
      loadingIndicatorRef: RefObject<LoadingIndicatorRef | null>;
    }) => {
      useEffect(() => {
        if (!hoisted.failVideo) return;
        const indicator = loadingIndicatorRef.current;
        indicator?.updateLoadingState({
          isVisible: true,
          isError: true,
          errorMessage: "video.error.loading",
          onRetry: hoisted.retryVideo,
        });
        return () => indicator?.resetLoadingState();
      }, [loadingIndicatorRef]);
      useImperativeHandle(ref, () => ({
        getIsVideoLoaded: () => true,
        play: () => {
          hoisted.playLivePhoto();
          onPlayingChange?.(true);
        },
        stop: () => {
          hoisted.stopLivePhoto();
          onPlayingChange?.(false);
        },
      }));
      return null;
    },
  };
});

vi.mock("~/atoms/context-menu", () => ({
  useShowContextMenu: () => vi.fn(),
}));

vi.mock("~/lib/feature", () => ({
  getCanUseWebGL() {
    return hoisted.canUseWebGL;
  },
}));

describe("ProgressiveImage", () => {
  it("loads a fitted display image first and only requests the original when zoom needs detail", async () => {
    hoisted.canUseWebGL = true;
    render(
      <ProgressiveImage
        src="original.heic"
        width={6000}
        height={4000}
        displayImages={[{ url: "display.jpg", width: 1600, height: 1067 }]}
        alt="Display first"
        isCurrentImage
        loadingIndicatorRef={{ current: null }}
      />,
    );
    const canvas = await screen.findByTestId("webgl-viewer");
    expect(hoisted.loadedUrls).toEqual(["display.jpg"]);
    expect(hoisted.webglCallbacks.detailSrc).toBe("original.heic");
    expect(hoisted.webglCallbacks.detailSourceBlob).toBeUndefined();
    expect(hoisted.webglCallbacks.viewerSession).toBe(
      hoisted.runtime.webGLViewerSession,
    );
    act(() => hoisted.webglCallbacks.onImagePainted?.());
    act(() => hoisted.webglCallbacks.onDetailRequested?.());
    await waitFor(() =>
      expect(hoisted.webglCallbacks.detailSourceBlob).toBeInstanceOf(Blob),
    );
    expect(hoisted.loadedUrls).toEqual(["display.jpg", "original.heic"]);
    expect(screen.getByTestId("webgl-viewer")).toBe(canvas);
    act(() => hoisted.webglCallbacks.onDetailRequested?.());
    expect(hoisted.loadedUrls).toHaveLength(2);
  });

  it("falls back to the original when a display image fails without reporting a photo failure", async () => {
    hoisted.canUseWebGL = true;
    hoisted.runtime.imageLoading.createLoader.mockReturnValueOnce({
      loadImage: (src: string) => {
        hoisted.loadedUrls.push(src);
        return Promise.reject(new Error("Missing display"));
      },
      cleanup: vi.fn(),
    });
    const onError = vi.fn();
    render(
      <ProgressiveImage
        src="original.jpg"
        width={6000}
        height={4000}
        displayImages={[{ url: "missing.jpg", width: 1600, height: 1067 }]}
        alt="Display fallback"
        isCurrentImage
        onError={onError}
        loadingIndicatorRef={{ current: null }}
      />,
    );
    await screen.findByTestId("webgl-viewer");
    expect(hoisted.loadedUrls).toEqual(["missing.jpg", "original.jpg"]);
    expect(onError).not.toHaveBeenCalled();
    expect(hoisted.webglCallbacks.onDetailRequested).toBeUndefined();
  });

  it("keeps the painted display canvas when original texture creation fails and offers retry", async () => {
    hoisted.canUseWebGL = true;
    const onError = vi.fn();
    const indicator = {
      current: { resetLoadingState: vi.fn(), updateLoadingState: vi.fn() },
    };
    render(
      <ProgressiveImage
        src="original.jpg"
        width={6000}
        height={4000}
        displayImages={[{ url: "display.jpg", width: 1600, height: 1067 }]}
        alt="Detail failure"
        isCurrentImage
        onError={onError}
        loadingIndicatorRef={indicator}
      />,
    );
    const canvas = await screen.findByTestId("webgl-viewer");
    act(() => hoisted.webglCallbacks.onImagePainted?.());
    act(() => hoisted.webglCallbacks.onDetailRequested?.());
    await waitFor(() =>
      expect(hoisted.webglCallbacks.detailSourceBlob).toBeInstanceOf(Blob),
    );
    act(() =>
      hoisted.webglCallbacks.onDetailError?.(
        new Error("Texture upload failed"),
      ),
    );
    expect(screen.getByTestId("webgl-viewer")).toBe(canvas);
    expect(onError).not.toHaveBeenCalled();
    expect(hoisted.loadedUrls).toEqual(["display.jpg", "original.jpg"]);
    act(() => hoisted.webglCallbacks.onImagePainted?.());
    expect(
      indicator.current.updateLoadingState.mock.calls.at(-1)![0].isError,
    ).toBe(true);
    const retry =
      indicator.current.updateLoadingState.mock.calls.at(-1)![0].onRetry;
    expect(retry).toBeTypeOf("function");
    act(() => retry());
    await waitFor(() =>
      expect(hoisted.loadedUrls).toEqual([
        "display.jpg",
        "original.jpg",
        "original.jpg",
      ]),
    );
    expect(screen.getByTestId("webgl-viewer")).toBe(canvas);
  });

  it.each(["hdr", "video"] as const)(
    "keeps %s photos on the original path",
    async (kind) => {
      render(
        <ProgressiveImage
          src="original.jpg"
          width={6000}
          height={4000}
          displayImages={[{ url: "display.jpg", width: 1600, height: 1067 }]}
          isHDR={kind === "hdr"}
          videoSource={
            kind === "video"
              ? { type: "live-photo", videoUrl: "video.mov" }
              : undefined
          }
          alt="Special photo"
          isCurrentImage
          loadingIndicatorRef={{ current: null }}
        />,
      );
      await screen.findByRole("img", { name: "Special photo" });
      expect(hoisted.loadedUrls).toEqual(["original.jpg"]);
    },
  );
  it("keeps Live and HDR badges together while playback feedback stays outside their layout", async () => {
    hoisted.supportsHDR = true;
    const { container } = render(
      <ProgressiveImage
        src="photo-with-live-and-hdr.jpg"
        alt="HDR Live Photo"
        loadingIndicatorRef={{ current: null }}
        isCurrentImage
        isHDR
        videoSource={{ type: "live-photo", videoUrl: "live.mov" }}
      />,
    );
    const live = await screen.findByRole("button", {
      name: "photo.live.badge",
    });
    const badges = container.querySelector("[data-photo-viewer-media-badges]");
    expect(badges?.contains(live)).toBe(true);
    expect(badges?.contains(screen.getByText("HDR"))).toBe(true);
    expect(live.getAttribute("aria-pressed")).toBe("false");

    // Video work starts only after the still image paints, so its later load
    // callback cannot dismiss a video failure/retry indicator.
    fireEvent.click(live);
    expect(hoisted.playLivePhoto).not.toHaveBeenCalled();
    fireEvent.load(screen.getByRole("img", { name: "HDR Live Photo" }));
    fireEvent.click(live);
    expect(hoisted.playLivePhoto).toHaveBeenCalledOnce();
    expect(live.getAttribute("aria-pressed")).toBe("true");
    expect(badges?.contains(screen.getByRole("status"))).toBe(false);
    expect(screen.getByRole("status").textContent).toContain(
      "photo.live.playing",
    );
    expect(screen.getByText("HDR")).toBeTruthy();

    fireEvent.click(live);
    expect(hoisted.stopLivePhoto).toHaveBeenCalledOnce();
    expect(live.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("waits for a returning still image to paint before mounting video and preserves video retry", async () => {
    const Harness = ({ active }: { active: boolean }) => {
      const indicator = useRef<LoadingIndicatorRef | null>(null);
      return (
        <>
          <ProgressiveImage
            src="live-photo.jpg"
            alt="Returning Live Photo"
            isCurrentImage={active}
            loadingIndicatorRef={indicator}
            videoSource={{ type: "live-photo", videoUrl: "live.mov" }}
          />
          <LoadingIndicator ref={indicator} />
        </>
      );
    };
    const { rerender } = render(<Harness active />);
    const firstImage = await screen.findByRole("img", {
      name: "Returning Live Photo",
    });
    fireEvent.load(firstImage);
    rerender(<Harness active={false} />);
    expect(
      screen.queryByRole("img", { name: "Returning Live Photo" }),
    ).toBeNull();

    vi.useFakeTimers();
    hoisted.failVideo = true;
    rerender(<Harness active />);
    expect(screen.queryByRole("alert")).toBeNull();
    const remountedImage = screen.getByRole("img", {
      name: "Returning Live Photo",
    });
    expect(remountedImage).not.toBe(firstImage);
    fireEvent.load(remountedImage);
    expect(screen.getByRole("alert").textContent).toContain(
      "video.error.loading",
    );
    fireEvent.load(remountedImage);
    expect(screen.getByRole("alert").textContent).toContain(
      "video.error.loading",
    );
    fireEvent.click(screen.getByRole("button", { name: "photo.error.retry" }));
    expect(hoisted.retryVideo).toHaveBeenCalledOnce();
  });

  it("keeps a thumbnail through inactive and returning canvas states and restores the retained Blob source", async () => {
    hoisted.canUseWebGL = true;
    const onBlobSrcChange = vi.fn();
    const indicator = {
      updateLoadingState: vi.fn(),
      resetLoadingState: vi.fn(),
    };
    const loadingIndicatorRef = { current: indicator };
    const props = {
      photoId: "returning-photo",
      src: "returning-photo.jpg",
      thumbnailSrc: "returning-thumbnail.jpg",
      alt: "Returning photo",
      onBlobSrcChange,
      loadingIndicatorRef,
    };
    const { rerender, unmount } = render(
      <ProgressiveImage {...props} isCurrentImage />,
    );
    const firstCanvas = await screen.findByTestId("webgl-viewer");
    expect(hoisted.webglCallbacks.previewCache).toBe(
      hoisted.runtime.imagePreviewCache,
    );
    act(() => hoisted.webglCallbacks.onImagePainted?.());
    expect(screen.queryByAltText("Returning photo")).toBeNull();
    const inactiveCallbacks = hoisted.webglCallbacks;
    rerender(<ProgressiveImage {...props} isCurrentImage={false} />);
    expect(screen.queryByTestId("webgl-viewer")).toBeNull();
    expect(screen.getByAltText("Returning photo").getAttribute("src")).toBe(
      "returning-thumbnail.jpg",
    );
    indicator.updateLoadingState.mockClear();
    act(() => {
      inactiveCallbacks.onLoadingStateChange?.(true, 0);
      inactiveCallbacks.onImagePainted?.();
    });
    expect(indicator.updateLoadingState).not.toHaveBeenCalled();

    onBlobSrcChange.mockClear();
    rerender(<ProgressiveImage {...props} isCurrentImage />);
    expect(screen.getByTestId("webgl-viewer")).not.toBe(firstCanvas);
    expect(screen.getByAltText("Returning photo")).toBeTruthy();
    expect(onBlobSrcChange).toHaveBeenLastCalledWith("blob:mock-image");
    expect(hoisted.runtime.imageLoading.createLoader).toHaveBeenCalledOnce();
    indicator.updateLoadingState.mockClear();
    act(() => {
      inactiveCallbacks.onLoadingStateChange?.(false);
      inactiveCallbacks.onImagePainted?.();
    });
    expect(indicator.updateLoadingState).not.toHaveBeenCalled();
    expect(screen.getByAltText("Returning photo")).toBeTruthy();
    act(() => hoisted.webglCallbacks.onImagePainted?.());
    expect(screen.queryByAltText("Returning photo")).toBeNull();
    const unmountedCallbacks = hoisted.webglCallbacks;
    unmount();
    indicator.updateLoadingState.mockClear();
    act(() => {
      unmountedCallbacks.onLoadingStateChange?.(false);
      unmountedCallbacks.onImagePainted?.();
    });
    expect(indicator.updateLoadingState).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "reports a native decode failure once, including after WebGL fallback (%s)",
    async (webgl) => {
      hoisted.canUseWebGL = webgl;
      hoisted.failWebGL = webgl;
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const onError = vi.fn();
      const loadingIndicatorRef = {
        current: { updateLoadingState: vi.fn(), resetLoadingState: vi.fn() },
      };
      render(
        <ProgressiveImage
          src="broken"
          alt="Broken photo"
          isCurrentImage
          onError={onError}
          loadingIndicatorRef={loadingIndicatorRef}
        />,
      );
      const image = await screen.findByRole("img", { name: "Broken photo" });
      fireEvent.error(image);
      fireEvent.error(image);
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          stage: "decode",
          code: "decode-failed",
          cause: expect.any(Event),
        }),
      );
      expect(errorLog).toHaveBeenCalledOnce();
      expect(
        loadingIndicatorRef.current.updateLoadingState,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          isVisible: true,
          isError: true,
          errorMessage: "photo.error.unsupported.title",
          errorDescription: "photo.error.unsupported.description",
          onRetry: expect.any(Function),
        }),
      );
      expect(screen.queryByRole("img", { name: "Broken photo" })).toBeNull();
    },
  );

  afterEach(() => {
    hoisted.canUseWebGL = false;
    hoisted.supportsHDR = false;
    hoisted.playLivePhoto.mockClear();
    hoisted.stopLivePhoto.mockClear();
    hoisted.failVideo = false;
    hoisted.retryVideo.mockClear();
    hoisted.failWebGL = false;
    hoisted.zoomIn.mockReset();
    hoisted.zoomOut.mockReset();
    hoisted.resetView.mockReset();
    hoisted.loadedUrls.length = 0;
    hoisted.runtime.imageLoading.createLoader.mockClear();
    hoisted.runtime.imageCache.delete.mockClear();
    resetThumbnailLoadCache();
    vi.restoreAllMocks();
    cleanup();
    vi.useRealTimers();
  });

  it("retries repeated image failures and clears the alert when loading succeeds", async () => {
    const signedUrl =
      "https://photos.example.test/original?signature=private-token";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const failure of [
      new MediaTaskError("fetch", "http", signedUrl, {
        httpStatus: 403,
        cause: new Error(signedUrl),
      }),
      new MediaTaskError("fetch", "timeout", signedUrl),
    ]) {
      hoisted.runtime.imageLoading.createLoader.mockReturnValueOnce({
        loadImage: () => Promise.reject(failure),
        cleanup: vi.fn(),
      });
    }
    const Harness = () => {
      const ref = useRef<LoadingIndicatorRef>(null);
      return (
        <>
          <LoadingIndicator ref={ref} />
          <ProgressiveImage
            src={signedUrl}
            alt="Retry photo"
            thumbnailSrc="/thumbnail.jpg"
            isCurrentImage
            loadingIndicatorRef={ref}
          />
        </>
      );
    };
    render(<Harness />);

    await screen.findByText("photo.error.forbidden.title");
    expect(
      screen.getByRole("img", { name: "Retry photo" }).getAttribute("src"),
    ).toBe("/thumbnail.jpg");
    fireEvent.click(screen.getByRole("button", { name: "photo.error.retry" }));
    await screen.findByText("photo.error.timeout.title");
    fireEvent.click(screen.getByRole("button", { name: "photo.error.retry" }));
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("img", { name: "Retry photo" })
          .some((image) => image.getAttribute("src") === "blob:mock-image"),
      ).toBe(true);
    });
    const original = screen
      .getAllByRole("img", { name: "Retry photo" })
      .find((image) => image.getAttribute("src") === "blob:mock-image")!;
    fireEvent.load(original);
    expect(screen.getByRole("img", { name: "Retry photo" })).toBe(original);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(hoisted.runtime.imageLoading.createLoader).toHaveBeenCalledTimes(3);
    expect(hoisted.runtime.imageCache.delete).toHaveBeenCalledTimes(2);
    expect(hoisted.runtime.imageCache.delete).toHaveBeenLastCalledWith(
      signedUrl,
    );
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("photos.example.test");
  });

  it("offers visible zoom controls and +, -, 0 keyboard shortcuts", async () => {
    hoisted.canUseWebGL = true;
    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        alt="Mountain at dusk"
        isCurrentImage
        loadingIndicatorRef={{ current: null }}
      />,
    );

    const viewer = await screen.findByRole("group", {
      name: "Mountain at dusk",
    });
    await screen.findByRole("toolbar", { name: "photo.zoom.controls" });

    fireEvent.keyDown(viewer, { key: "+" });
    fireEvent.keyDown(viewer, { key: "-" });
    fireEvent.keyDown(viewer, { key: "0" });

    expect(hoisted.zoomIn).toHaveBeenCalledWith(true);
    expect(hoisted.zoomOut).toHaveBeenCalledWith(true);
    expect(hoisted.resetView).toHaveBeenCalledTimes(1);
  });

  it("shows the thumbnail when the browser reports the image as already loaded on mount", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      1600,
    );

    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        thumbnailSrc="https://example.com/photo-thumb.jpg"
        alt="Loaded thumbnail"
        isCurrentImage={false}
        shouldRenderHighRes={false}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    const thumbnail = screen.getByAltText("Loaded thumbnail");

    await waitFor(() => {
      expect(thumbnail.className).toContain("opacity-100");
    });
  });

  it("seeds cached thumbnails as loaded on the first frame (virtual-slide remount)", () => {
    // Swiper virtual 只保活 ±1 张，翻远再翻回是全新挂载：曾加载过的低清图必须
    // 首帧即 opacity-100（同步断言、不 waitFor），否则 300ms 淡入每次重放。
    const thumbnailSrc = "https://example.com/photo-thumb.jpg";
    markThumbnailLoaded(getThumbnailLoadCacheKey("photo-1", thumbnailSrc));

    render(
      <ProgressiveImage
        photoId="photo-1"
        src="https://example.com/photo.jpg"
        thumbnailSrc={thumbnailSrc}
        alt="Remounted thumbnail"
        isCurrentImage={false}
        shouldRenderHighRes={false}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    expect(screen.getByAltText("Remounted thumbnail").className).toContain(
      "opacity-100",
    );
  });

  it("keeps a thumbhash placeholder visible while the detail thumbnail is still loading", () => {
    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        thumbnailSrc="https://example.com/photo-thumb.jpg"
        thumbHash="mock-thumbhash"
        alt="Loading detail thumbnail"
        isCurrentImage={false}
        shouldRenderHighRes={false}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    expect(screen.getByTestId("photo-detail-thumbhash")).toBeTruthy();
    expect(screen.getByAltText("Loading detail thumbnail").className).toContain(
      "opacity-0",
    );
  });

  it("marks the detail thumbnail as loaded in the shared thumbnail cache", () => {
    const thumbnailSrc = "https://example.com/photo-thumb.jpg";

    render(
      <ProgressiveImage
        photoId="photo-1"
        src="https://example.com/photo.jpg"
        thumbnailSrc={thumbnailSrc}
        thumbHash="mock-thumbhash"
        alt="Caching detail thumbnail"
        isCurrentImage={false}
        shouldRenderHighRes={false}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    fireEvent.load(screen.getByAltText("Caching detail thumbnail"));

    expect(
      hasLoadedThumbnail(getThumbnailLoadCacheKey("photo-1", thumbnailSrc)),
    ).toBe(true);
  });

  it("keeps the thumbhash fallback when no detail thumbnail is available", () => {
    render(
      <ProgressiveImage
        photoId="photo-1"
        src="https://example.com/photo.jpg"
        thumbHash="fallback-thumbhash"
        alt="No detail thumbnail"
        isCurrentImage={false}
        shouldRenderHighRes={false}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    expect(screen.getByTestId("photo-detail-thumbhash")).toBeTruthy();
    expect(screen.queryByAltText("No detail thumbnail")).toBeNull();
  });

  it("renders a DOM high-resolution image when WebGL is unavailable", async () => {
    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        thumbnailSrc={undefined}
        alt="High resolution fallback"
        isCurrentImage={true}
        shouldRenderHighRes={true}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    const highResImage = await screen.findByAltText("High resolution fallback");

    await waitFor(() => {
      expect(highResImage.getAttribute("src")).toBe("blob:mock-image");
    });
    expect(highResImage.parentElement?.style.width).toBe("100%");
    expect(highResImage.parentElement?.style.height).toBe("100%");
    expect(screen.getByText("photo.webgl.unavailable")).toBeTruthy();
  });

  it("falls back to the DOM viewer when WebGL reports a runtime failure", async () => {
    hoisted.canUseWebGL = true;
    hoisted.failWebGL = true;

    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        thumbnailSrc={undefined}
        alt="WebGL runtime fallback"
        isCurrentImage={true}
        shouldRenderHighRes={true}
        loadingIndicatorRef={{ current: null }}
      />,
    );

    const fallbackImage = await screen.findByAltText("WebGL runtime fallback");

    await waitFor(() => {
      expect(fallbackImage.getAttribute("src")).toBe("blob:mock-image");
    });
  });
});
