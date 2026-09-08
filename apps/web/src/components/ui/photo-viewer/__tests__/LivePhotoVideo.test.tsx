import { cleanup, render, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { VideoSource } from "~/lib/image-loading-types";

import { LivePhotoVideo } from "../LivePhotoVideo";

const runtime = vi.hoisted(() => ({
  imageLoading: {
    createLoader: vi.fn(),
    cleanupLoader: (loader: { cleanup: () => void }) => loader.cleanup(),
  },
}));
vi.mock("~/runtime/app-runtime", () => ({ useAfilmoryRuntime: () => runtime }));

// 避免加载 @afilmory/ui 整个 barrel；组件只用到 clsxm。
vi.mock("@afilmory/ui", () => ({
  clsxm: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

function createImageLoaderManager() {
  return {
    processVideo: vi.fn(
      async (_source: VideoSource, videoElement: HTMLVideoElement) => {
        videoElement.setAttribute("src", "blob:viewer-live-photo");
        return {};
      },
    ),
    cleanup: vi.fn(),
  };
}

const motionPhotoSource: VideoSource = {
  type: "motion-photo",
  imageUrl: "https://example.com/photo.jpg",
  offset: 1024,
  size: 2048,
};

describe("LivePhotoVideo", () => {
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

  afterEach(() => {
    cleanup();
  });

  it("does not reload when re-rendered with a structurally equal video source", async () => {
    const manager = createImageLoaderManager();
    runtime.imageLoading.createLoader.mockReturnValue(manager);
    const loadingIndicatorRef = { current: null };

    const { rerender } = render(
      <LivePhotoVideo
        videoSource={motionPhotoSource}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage
      />,
    );

    await waitFor(() => {
      expect(manager.processVideo).toHaveBeenCalledTimes(1);
    });

    rerender(
      <LivePhotoVideo
        videoSource={{ ...motionPhotoSource }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage
      />,
    );

    expect(manager.processVideo).toHaveBeenCalledTimes(1);
    expect(manager.cleanup).not.toHaveBeenCalled();
  });

  it("reloads when the video source key changes", async () => {
    const manager = createImageLoaderManager();
    runtime.imageLoading.createLoader.mockReturnValue(manager);
    const loadingIndicatorRef = { current: null };

    const { rerender } = render(
      <LivePhotoVideo
        videoSource={motionPhotoSource}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage
      />,
    );

    await waitFor(() => {
      expect(manager.processVideo).toHaveBeenCalledTimes(1);
    });

    rerender(
      <LivePhotoVideo
        videoSource={{ ...motionPhotoSource, offset: 4096 }}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage
      />,
    );

    await waitFor(() => {
      expect(manager.processVideo).toHaveBeenCalledTimes(2);
    });
  });
});
