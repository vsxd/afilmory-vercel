import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "~/lib/thumbnail-load-cache";

import { ProgressiveImage } from "../ProgressiveImage";

const hoisted = vi.hoisted(() => ({
  canUseWebGL: false,
  failWebGL: false,
  runtime: {
    imageCache: {},
    imageLoading: {
      createLoader: vi.fn(() => ({
        loadImage: () =>
          Promise.resolve({
            blobSrc: "blob:mock-image",
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
    WebGLImageViewer: ({ onError }: { onError?: (error: unknown) => void }) => {
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
  afterEach(() => {
    hoisted.canUseWebGL = false;
    hoisted.failWebGL = false;
    resetThumbnailLoadCache();
    vi.restoreAllMocks();
    cleanup();
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
