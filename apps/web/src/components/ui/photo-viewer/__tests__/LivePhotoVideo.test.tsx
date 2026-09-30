import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

import type { VideoSource } from "~/lib/image-loading-types";

import { LivePhotoVideo } from "../LivePhotoVideo";
import type { LoadingIndicatorRef } from "../LoadingIndicator";
import { LoadingIndicator } from "../LoadingIndicator";

const runtime = vi.hoisted(() => ({
  t: (key: string) => key,
  imageLoading: {
    createLoader: vi.fn(),
    cleanupLoader: (loader: { cleanup: () => void }) => loader.cleanup(),
  },
}));
vi.mock("~/runtime/app-runtime", () => ({ useAfilmoryRuntime: () => runtime }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: runtime.t }) }));

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

function VideoWithIndicator({ source }: { source: VideoSource }) {
  const indicator = useRef<LoadingIndicatorRef>(null);
  return (
    <>
      <LoadingIndicator ref={indicator} />
      <LivePhotoVideo
        videoSource={source}
        loadingIndicatorRef={indicator}
        isCurrentImage
      />
    </>
  );
}

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

  beforeEach(() => runtime.imageLoading.createLoader.mockReset());

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

  it("retries a failed video on the same photo through the visible retry button", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = createImageLoaderManager();
    failed.processVideo.mockRejectedValue(new Error("offline"));
    const recovered = createImageLoaderManager();
    runtime.imageLoading.createLoader
      .mockReturnValueOnce(failed)
      .mockReturnValue(recovered);
    render(<VideoWithIndicator source={motionPhotoSource} />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "video.error.loading",
    );
    fireEvent.click(screen.getByRole("button", { name: "photo.error.retry" }));
    await waitFor(() => expect(recovered.processVideo).toHaveBeenCalledOnce());
    expect(failed.cleanup).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(recovered.processVideo.mock.calls[0][0]).toEqual(motionPhotoSource);
    errorLog.mockRestore();
  });

  it("ignores a previous source's late failure after the current video succeeds", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectOld!: (error: Error) => void;
    const old = createImageLoaderManager();
    old.processVideo.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        }),
    );
    const current = createImageLoaderManager();
    runtime.imageLoading.createLoader
      .mockReturnValueOnce(old)
      .mockReturnValue(current);
    const { rerender } = render(
      <VideoWithIndicator source={motionPhotoSource} />,
    );
    await waitFor(() => expect(old.processVideo).toHaveBeenCalledOnce());
    rerender(
      <VideoWithIndicator source={{ ...motionPhotoSource, offset: 4096 }} />,
    );
    await waitFor(() => expect(current.processVideo).toHaveBeenCalledOnce());
    await act(async () => rejectOld(new Error("obsolete failure")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(errorLog).not.toHaveBeenCalled();
    expect(old.cleanup).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });
});
