import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import type { Mock } from "vitest";
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

import type { ImageLoaderManager } from "~/lib/image-loader-manager";

import { useLivePhotoHandler } from "../useLivePhotoHandler";

let processVideoMock: Mock<ImageLoaderManager["processVideo"]>;
let cleanupMock: Mock<ImageLoaderManager["cleanup"]>;

const deviceState = vi.hoisted(() => ({ isMobile: false }));

vi.mock("~/lib/device-viewport", () => ({
  get isMobileDevice() {
    return deviceState.isMobile;
  },
}));

const runtimeMock = vi.hoisted(() => ({
  imageCache: {},
  imageLoading: {
    createLoader: vi.fn(),
    cleanupLoader: vi.fn((loader: { cleanup: () => void }) => {
      loader.cleanup();
    }),
  },
}));

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => runtimeMock,
}));

function LivePhotoHandlerHarness({
  data,
  tick,
}: {
  data: {
    id: string;
    originalUrl: string;
    video: { type: "live-photo"; videoUrl: string };
  };
  tick: number;
}) {
  const {
    videoRef,
    isConvertingVideo,
    isPlayingLivePhoto,
    handleMouseEnter,
    handleMouseLeave,
  } = useLivePhotoHandler({
    data: data as never,
    imageLoaded: true,
  });

  return (
    <div
      data-testid="live-photo-handler"
      data-tick={String(tick)}
      data-converting={String(isConvertingVideo)}
      data-playing={String(isPlayingLivePhoto)}
    >
      <video ref={videoRef} />
      {/* React synthesizes mouseenter from mouseover, which fireEvent.mouseEnter
          does not emulate — drive the handlers through plain clicks instead. */}
      <button data-testid="enter" type="button" onClick={handleMouseEnter} />
      <button data-testid="leave" type="button" onClick={handleMouseLeave} />
    </div>
  );
}

const photoData = {
  id: "photo-1",
  originalUrl: "https://example.com/photo.jpg",
  video: {
    type: "live-photo" as const,
    videoUrl: "https://example.com/photo.mov",
  },
};

describe("useLivePhotoHandler", () => {
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
    deviceState.isMobile = false;
    processVideoMock = vi.fn<ImageLoaderManager["processVideo"]>();
    cleanupMock = vi.fn<ImageLoaderManager["cleanup"]>();
    runtimeMock.imageLoading.createLoader.mockImplementation(() => ({
      processVideo: (...args: Parameters<ImageLoaderManager["processVideo"]>) =>
        processVideoMock(...args),
      cleanup: (...args: Parameters<ImageLoaderManager["cleanup"]>) =>
        cleanupMock(...args),
    }));

    processVideoMock.mockImplementation(
      async (_videoSource, videoElement: HTMLVideoElement) => {
        videoElement.setAttribute("src", "blob:masonry-live-photo");
        return {};
      },
    );
  });

  afterEach(() => {
    runtimeMock.imageLoading.createLoader.mockReset();
    runtimeMock.imageLoading.cleanupLoader.mockClear();
    playSpy.mockClear();
    cleanup();
  });

  it("does not fetch video bytes before hover intent", () => {
    render(<LivePhotoHandlerHarness data={photoData} tick={0} />);

    expect(runtimeMock.imageLoading.createLoader).not.toHaveBeenCalled();
    expect(processVideoMock).not.toHaveBeenCalled();
  });

  it("requires a 200ms hover dwell and cancels a passing pointer", async () => {
    vi.useFakeTimers();
    const { getByTestId } = render(
      <LivePhotoHandlerHarness data={photoData} tick={0} />,
    );

    fireEvent.click(getByTestId("enter"));
    await act(() => vi.advanceTimersByTimeAsync(199));
    expect(runtimeMock.imageLoading.createLoader).not.toHaveBeenCalled();

    fireEvent.click(getByTestId("leave"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(runtimeMock.imageLoading.createLoader).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cancels an unfinished request when the pointer leaves", async () => {
    processVideoMock.mockImplementation(() => new Promise(() => {}));
    const { getByTestId } = render(
      <LivePhotoHandlerHarness data={photoData} tick={0} />,
    );

    fireEvent.click(getByTestId("enter"));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    fireEvent.click(getByTestId("leave"));

    await waitFor(() => expect(cleanupMock).toHaveBeenCalledTimes(1));
  });

  it("limits grid video processing to two concurrent requests", async () => {
    const resolvers: Array<() => void> = [];
    processVideoMock.mockImplementation(
      () =>
        new Promise<object>((resolve) => {
          resolvers.push(() => resolve({}));
        }),
    );
    const { getAllByTestId } = render(
      <>
        <LivePhotoHandlerHarness data={photoData} tick={0} />
        <LivePhotoHandlerHarness
          data={{
            ...photoData,
            id: "photo-2",
            video: {
              ...photoData.video,
              videoUrl: "https://example.com/2.mov",
            },
          }}
          tick={0}
        />
        <LivePhotoHandlerHarness
          data={{
            ...photoData,
            id: "photo-3",
            video: {
              ...photoData.video,
              videoUrl: "https://example.com/3.mov",
            },
          }}
          tick={0}
        />
      </>,
    );

    getAllByTestId("enter").forEach((button) => fireEvent.click(button));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(2));

    await act(async () => resolvers.shift()?.());
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(3));
    await act(async () => resolvers.splice(0).forEach((resolve) => resolve()));
  });

  it("loads once on first hover and keeps the video source across re-renders", async () => {
    const { container, getByTestId, rerender } = render(
      <LivePhotoHandlerHarness data={photoData} tick={0} />,
    );

    const videoElement = container.querySelector("video");
    expect(videoElement).not.toBeNull();

    fireEvent.click(getByTestId("enter"));

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(videoElement?.getAttribute("src")).toBe("blob:masonry-live-photo");
    });

    rerender(
      <LivePhotoHandlerHarness
        data={{
          id: photoData.id,
          originalUrl: photoData.originalUrl,
          video: { ...photoData.video },
        }}
        tick={1}
      />,
    );

    expect(processVideoMock).toHaveBeenCalledTimes(1);
    expect(videoElement?.getAttribute("src")).toBe("blob:masonry-live-photo");
  });

  it("starts playback when a hover-initiated load finishes while still hovered", async () => {
    const { getByTestId } = render(
      <LivePhotoHandlerHarness data={photoData} tick={0} />,
    );

    fireEvent.click(getByTestId("enter"));

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(playSpy).toHaveBeenCalledTimes(1);
    });
    expect(getByTestId("live-photo-handler").dataset.playing).toBe("true");
  });

  it("does not autoplay when the pointer left before the load finished", async () => {
    let resolveLoad: (() => void) | undefined;
    processVideoMock.mockImplementation(
      (_videoSource, videoElement: HTMLVideoElement) =>
        new Promise<object>((resolve) => {
          resolveLoad = () => {
            videoElement.setAttribute("src", "blob:masonry-live-photo");
            resolve({});
          };
        }),
    );

    const { getByTestId } = render(
      <LivePhotoHandlerHarness data={photoData} tick={0} />,
    );

    fireEvent.click(getByTestId("enter"));
    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(getByTestId("leave"));
    resolveLoad?.();

    await waitFor(() => {
      expect(getByTestId("live-photo-handler").dataset.converting).toBe(
        "false",
      );
    });

    // The play timer is 200ms; give it room to (wrongly) fire before asserting.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(playSpy).not.toHaveBeenCalled();
    expect(getByTestId("live-photo-handler").dataset.playing).toBe("false");
  });

  it("never requests the video on touch devices", async () => {
    deviceState.isMobile = true;

    const { getByTestId } = render(
      <LivePhotoHandlerHarness data={photoData} tick={0} />,
    );

    fireEvent.click(getByTestId("enter"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runtimeMock.imageLoading.createLoader).not.toHaveBeenCalled();
    expect(processVideoMock).not.toHaveBeenCalled();
  });
});
