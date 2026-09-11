import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
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

const hoisted = vi.hoisted(() => ({
  canUseWebGL: false,
  failWebGL: false,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  resetView: vi.fn(),
  runtime: {
    imageCache: { delete: vi.fn() },
    imageLoading: {
      createLoader: vi.fn(() => ({
        loadImage: () =>
          Promise.resolve({
            blobSrc: "blob:mock-image",
            release: vi.fn(),
            blob: new Blob(["photo"], { type: "image/jpeg" }),
          }),
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
    WebGLImageViewer: ({
      onError,
      ref,
    }: {
      onError?: (error: unknown) => void;
      ref?: React.RefObject<{
        zoomIn: () => void;
        zoomOut: () => void;
        resetView: () => void;
        getScale: () => number;
      } | null>;
    }) => {
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
  useMediaQuery: () => false,
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

vi.mock("~/atoms/context-menu", () => ({
  useShowContextMenu: () => vi.fn(),
}));

vi.mock("~/lib/feature", () => ({
  get canUseWebGL() {
    return hoisted.canUseWebGL;
  },
}));

describe("ProgressiveImage", () => {
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
    hoisted.failWebGL = false;
    hoisted.zoomIn.mockReset();
    hoisted.zoomOut.mockReset();
    hoisted.resetView.mockReset();
    hoisted.runtime.imageLoading.createLoader.mockClear();
    hoisted.runtime.imageCache.delete.mockClear();
    resetThumbnailLoadCache();
    vi.restoreAllMocks();
    cleanup();
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
