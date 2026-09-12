import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebGLImageViewer } from "./WebGLImageViewer";
import { WebGLImageViewerEngine } from "./WebGLImageViewerEngine";

const engineMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  isTileOutlineEnabled: vi.fn(() => false),
  loadImage: vi.fn(() => Promise.resolve()),
  setSmooth: vi.fn(),
  throwOnConstruct: false,
}));

vi.mock("./WebGLImageViewerEngine", () => ({
  WebGLImageViewerEngine: vi.fn(
    class {
      destroy = engineMocks.destroy;
      isTileOutlineEnabled = engineMocks.isTileOutlineEnabled;
      loadImage = engineMocks.loadImage;
      setSmooth = engineMocks.setSmooth;
      resetView = vi.fn();
      zoomIn = vi.fn();
      zoomOut = vi.fn();
      getScale = vi.fn(() => 1);
      setTileOutlineEnabled = vi.fn();

      constructor() {
        if (engineMocks.throwOnConstruct) {
          throw new Error("WebGL init failed");
        }
      }
    },
  ),
}));

describe("WebGLImageViewer", () => {
  afterEach(() => {
    cleanup();
    engineMocks.throwOnConstruct = false;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("initializes reduced motion correctly without destroying or reloading the canvas", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(<WebGLImageViewer src="blob:photo" smooth />);

    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1);
    expect(vi.mocked(WebGLImageViewerEngine).mock.calls[0][1].smooth).toBe(
      false,
    );
    expect(engineMocks.loadImage).toHaveBeenCalledTimes(1);
    expect(engineMocks.destroy).not.toHaveBeenCalled();
  });

  it("updates live motion preferences and the smooth prop without rebuilding the engine", () => {
    let onPreferenceChange: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        onPreferenceChange = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", () => media);
    const { rerender, unmount } = render(
      <WebGLImageViewer src="blob:photo" smooth />,
    );
    expect(vi.mocked(WebGLImageViewerEngine).mock.calls[0][1].smooth).toBe(
      true,
    );

    act(() => {
      media.matches = true;
      onPreferenceChange?.();
    });
    expect(engineMocks.setSmooth).toHaveBeenLastCalledWith(false);

    act(() => {
      media.matches = false;
      onPreferenceChange?.();
    });
    expect(engineMocks.setSmooth).toHaveBeenLastCalledWith(true);

    rerender(<WebGLImageViewer src="blob:photo" smooth={false} />);
    expect(engineMocks.setSmooth).toHaveBeenLastCalledWith(false);
    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1);
    expect(engineMocks.loadImage).toHaveBeenCalledTimes(1);
    expect(engineMocks.destroy).not.toHaveBeenCalled();

    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith(
      "change",
      onPreferenceChange,
    );
  });

  it("creates and disposes the viewer engine", () => {
    const sourceBlob = new Blob(["photo"], { type: "image/jpeg" });
    const { unmount } = render(
      <WebGLImageViewer
        src="blob:photo"
        sourceBlob={sourceBlob}
        width={100}
        height={80}
      />,
    );

    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1);
    expect(engineMocks.loadImage).toHaveBeenCalledWith(
      "blob:photo",
      100,
      80,
      sourceBlob,
    );

    unmount();

    expect(engineMocks.destroy).toHaveBeenCalledTimes(1);
  });

  it("exposes caller-provided image semantics while hiding the raw canvas", () => {
    const { getByRole, container } = render(
      <WebGLImageViewer
        src="blob:photo"
        width={100}
        height={80}
        role="img"
        aria-label="Mountain at sunset"
      />,
    );

    expect(getByRole("img").getAttribute("aria-label")).toBe(
      "Mountain at sunset",
    );
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("reports engine initialization failures without throwing from the effect", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    engineMocks.throwOnConstruct = true;
    const onError = vi.fn();

    expect(() =>
      render(
        <WebGLImageViewer
          src="blob:photo"
          width={100}
          height={80}
          onError={onError}
        />,
      ),
    ).not.toThrow();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(consoleError).toHaveBeenCalled();
    expect(engineMocks.loadImage).not.toHaveBeenCalled();
  });

  it("keeps the engine alive across callback/config identity changes and forwards to the latest callback", () => {
    const firstOnZoomChange = vi.fn();
    const { rerender } = render(
      <WebGLImageViewer
        src="blob:photo"
        width={100}
        height={80}
        onZoomChange={firstOnZoomChange}
      />,
    );

    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1);

    // 内联回调 + 内联同值配置对象：只有引用变化，不应重建引擎（重建 = 全图重取重解码）
    const secondOnZoomChange = vi.fn();
    rerender(
      <WebGLImageViewer
        src="blob:photo"
        width={100}
        height={80}
        onZoomChange={secondOnZoomChange}
        wheel={{ step: 0.1 }}
        className="zoomed"
      />,
    );

    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1);
    expect(engineMocks.destroy).not.toHaveBeenCalled();

    // 引擎在构造时捕获的回调必须始终指向最新的 prop
    const config = vi.mocked(WebGLImageViewerEngine).mock.calls[0][1];
    config.onZoomChange(2, 0.5);
    expect(firstOnZoomChange).not.toHaveBeenCalled();
    expect(secondOnZoomChange).toHaveBeenCalledWith(2, 0.5);
  });

  it("destroys and recreates the engine when src changes", () => {
    const { rerender } = render(
      <WebGLImageViewer src="blob:a" width={100} height={80} />,
    );

    rerender(<WebGLImageViewer src="blob:b" width={100} height={80} />);

    expect(engineMocks.destroy).toHaveBeenCalledTimes(1);
    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(2);
    expect(engineMocks.loadImage).toHaveBeenLastCalledWith(
      "blob:b",
      100,
      80,
      null,
    );
  });

  it("reports image loading failures through the error callback", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onError = vi.fn();
    const loadError = new Error("WebGL image load failed");
    engineMocks.loadImage.mockRejectedValueOnce(loadError);

    render(
      <WebGLImageViewer
        src="blob:photo"
        width={100}
        height={80}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(loadError);
    });
    expect(consoleError).toHaveBeenCalled();
  });
});
