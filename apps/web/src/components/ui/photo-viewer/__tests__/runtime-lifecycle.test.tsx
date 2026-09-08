import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { useImageLoader, useProgressiveImageState } from "../hooks";
import type { LivePhotoVideoHandle } from "../LivePhotoVideo";
import { LivePhotoVideo } from "../LivePhotoVideo";

let loadImageMock: ReturnType<typeof vi.fn>;
let processVideoMock: ReturnType<typeof vi.fn>;
let cleanupMock: ReturnType<typeof vi.fn>;
let animationStartMock: ReturnType<typeof vi.fn>;
let animationSetMock: ReturnType<typeof vi.fn>;
const runtimeMock = vi.hoisted(() => ({
  imageCache: {},
  imageLoading: {
    cleanupLoader: vi.fn((loader: { cleanup: () => void }) => loader.cleanup()),
    createLoader: vi.fn(),
  },
}));

vi.mock("~/lib/image-loader-manager", () => {
  class MockImageLoaderManager {
    loadImage(...args: unknown[]) {
      return loadImageMock(...args);
    }

    processVideo(...args: unknown[]) {
      return processVideoMock(...args);
    }

    cleanup(...args: unknown[]) {
      return cleanupMock(...args);
    }
  }

  return { ImageLoaderManager: MockImageLoaderManager };
});

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => runtimeMock,
}));

vi.mock("react-i18next", () => ({
  // ~/i18n 在模块加载时会 i18n.use(initReactI18next).init(...)：
  // 下面的 runtime 隔离测试通过 importActual 拉起真实 app-runtime -> image-convert -> ~/i18n
  // 依赖链，所以 mock 必须提供一个合法的 3rdParty 插件桩，否则模块加载即抛错。
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@afilmory/ui", () => ({
  clsxm: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  const MotionVideo = ({
    ref,
    ...props
  }: React.ComponentProps<"video"> & {
    ref?: React.RefObject<HTMLVideoElement | null>;
  }) => <video ref={ref} {...props} />;

  MotionVideo.displayName = "MotionVideo";

  return {
    m: { video: MotionVideo },
    useReducedMotion: () => false,

    useAnimationControls: () => ({
      start: (...args: unknown[]) => animationStartMock(...args),
      set: (...args: unknown[]) => animationSetMock(...args),
    }),
  };
});

function ImageLoaderHarness({
  tick,
  src = "https://example.com/photo.jpg",
}: {
  tick: number;
  src?: string;
}) {
  const [state, actions] = useProgressiveImageState();
  const blobSrc =
    state.image.status === "loaded" ? state.image.lease.blobSrc : null;
  const highResLoaded = state.image.status === "loaded";
  const loadingIndicatorRef = useRef({
    updateLoadingState: vi.fn(),
    resetLoadingState: vi.fn(),
  });

  useImageLoader({
    src,
    isCurrentImage: true,
    image: state.image,
    loadingIndicatorRef,
    actions,
  });

  return (
    <div
      data-testid="image-loader-state"
      data-blob-src={blobSrc ?? ""}
      data-loaded={highResLoaded ? "true" : "false"}
      data-tick={String(tick)}
    />
  );
}

describe("photo viewer runtime lifecycle", () => {
  let loadSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    loadSpy = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterAll(() => {
    loadSpy.mockRestore();
    pauseSpy.mockRestore();
    playSpy.mockRestore();
  });

  beforeEach(() => {
    loadImageMock = vi.fn();
    processVideoMock = vi.fn();
    cleanupMock = vi.fn();
    animationStartMock = vi.fn(async () => {});
    animationSetMock = vi.fn();
    runtimeMock.imageLoading.cleanupLoader.mockClear();
    runtimeMock.imageLoading.createLoader.mockImplementation(() => ({
      loadImage: (...args: unknown[]) => loadImageMock(...args),
      processVideo: (...args: unknown[]) => processVideoMock(...args),
      cleanup: (...args: unknown[]) => cleanupMock(...args),
    }));
    loadSpy.mockClear();
    pauseSpy.mockClear();
    playSpy.mockClear();

    loadImageMock.mockResolvedValue({
      blobSrc: "blob:loaded-image",
      release: vi.fn(),
      blob: new Blob(["photo"], { type: "image/jpeg" }),
    });

    processVideoMock.mockImplementation(
      async (_videoSource, videoElement: HTMLVideoElement) => {
        videoElement.setAttribute("src", "blob:loaded-live-photo");
        return {};
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("releases the old lease and loads a changed image source in the same component", async () => {
    const first = {
      blobSrc: "blob:first",
      blob: new Blob(["a"]),
      release: vi.fn(),
    };
    const second = {
      blobSrc: "blob:second",
      blob: new Blob(["b"]),
      release: vi.fn(),
    };
    loadImageMock.mockResolvedValueOnce(first).mockResolvedValue(second);
    const { rerender, unmount } = render(
      <ImageLoaderHarness tick={0} src="first" />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("image-loader-state").dataset.blobSrc).toBe(
        first.blobSrc,
      ),
    );
    rerender(<ImageLoaderHarness tick={1} src="second" />);
    await waitFor(() =>
      expect(screen.getByTestId("image-loader-state").dataset.blobSrc).toBe(
        second.blobSrc,
      ),
    );
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.release).not.toHaveBeenCalled();
    expect(loadImageMock).toHaveBeenCalledTimes(2);
    unmount();
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the live photo video source after the initial load settles", async () => {
    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never;

    const { container, rerender } = render(
      <LivePhotoVideo
        videoSource={{
          type: "live-photo",
          videoUrl: "https://example.com/live.mov",
        }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    );

    const videoElement = container.querySelector("video");
    expect(videoElement).not.toBeNull();

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(videoElement?.getAttribute("src")).toBe("blob:loaded-live-photo");
    });

    rerender(
      <LivePhotoVideo
        videoSource={{
          type: "live-photo",
          videoUrl: "https://example.com/live.mov",
        }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    );

    expect(processVideoMock).toHaveBeenCalledTimes(1);
    expect(cleanupMock).not.toHaveBeenCalled();
    expect(videoElement?.getAttribute("src")).toBe("blob:loaded-live-photo");
  });

  it("cleans up the active live photo request when the current image changes", async () => {
    const videoLoad = Promise.withResolvers<void>();
    processVideoMock.mockReturnValue(videoLoad.promise);

    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never;

    const { rerender } = render(
      <LivePhotoVideo
        videoSource={{
          type: "live-photo",
          videoUrl: "https://example.com/live.mov",
        }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    );

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <LivePhotoVideo
        videoSource={{
          type: "live-photo",
          videoUrl: "https://example.com/live.mov",
        }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={false}
      />,
    );

    expect(cleanupMock).toHaveBeenCalledTimes(1);

    videoLoad.resolve();
  });

  it("cleans up the live photo manager on unmount", async () => {
    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never;

    const { unmount } = render(
      <LivePhotoVideo
        videoSource={{
          type: "live-photo",
          videoUrl: "https://example.com/live.mov",
        }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    );

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(cleanupMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled live photo play when the component unmounts before the timer fires", async () => {
    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never;
    const livePhotoRef = {
      current: null,
    } as React.RefObject<LivePhotoVideoHandle | null>;

    const { unmount } = render(
      <LivePhotoVideo
        ref={livePhotoRef}
        videoSource={{
          type: "live-photo",
          videoUrl: "https://example.com/live.mov",
        }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    );

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    vi.useFakeTimers();

    await act(async () => {
      livePhotoRef.current?.play();
    });

    unmount();

    await act(async () => {
      vi.runAllTimers();
    });

    expect(animationStartMock).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("gives each app runtime an independent image converter manager", async () => {
    // 本文件顶部 mock 了 ~/runtime/app-runtime，这里用 importActual 拿真实实现，
    // 验证转换管理器已经从模块级单例改为 runtime 级作用域：
    // 两个 runtime 的并发管道 / pending 去重状态必须相互独立。
    const [
      { createAppRuntime },
      { ImageConverterManager },
      { createManifest },
    ] = await Promise.all([
      vi.importActual<typeof import("~/runtime/app-runtime")>(
        "~/runtime/app-runtime",
      ),
      vi.importActual<typeof import("~/lib/image-convert")>(
        "~/lib/image-convert",
      ),
      vi.importActual<typeof import("@afilmory/schema")>("@afilmory/schema"),
    ]);

    const manifest = createManifest({ photos: [] });
    const runtimeA = createAppRuntime({ manifest });
    const runtimeB = createAppRuntime({ manifest });

    try {
      expect(runtimeA.imageConverter).toBeInstanceOf(ImageConverterManager);
      expect(runtimeB.imageConverter).toBeInstanceOf(ImageConverterManager);
      expect(runtimeA.imageConverter).not.toBe(runtimeB.imageConverter);

      // 修改一个 runtime 的策略表不影响另一个，证明内部状态没有跨 runtime 共享。
      runtimeA.imageConverter.removeStrategy("HEIC");
      expect(runtimeA.imageConverter.getSupportedFormats()).not.toContain(
        "image/heic",
      );
      expect(runtimeB.imageConverter.getSupportedFormats()).toContain(
        "image/heic",
      );
    } finally {
      runtimeA.dispose();
      runtimeB.dispose();
    }
  });

  it("keeps the image lease after loading and releases it only on unmount", async () => {
    const { rerender, unmount } = render(<ImageLoaderHarness tick={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("image-loader-state").dataset.loaded).toBe(
        "true",
      );
    });

    rerender(<ImageLoaderHarness tick={1} />);

    const result = await loadImageMock.mock.results[0].value;
    expect(result.release).not.toHaveBeenCalled();
    unmount();
    expect(result.release).toHaveBeenCalledTimes(1);
  });
});
