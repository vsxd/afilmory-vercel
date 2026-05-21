import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebGLImageViewer } from "./WebGLImageViewer";
import { WebGLImageViewerEngine } from "./WebGLImageViewerEngine";

const engineMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  isTileOutlineEnabled: vi.fn(() => false),
  loadImage: vi.fn(() => Promise.resolve()),
  throwOnConstruct: false,
}));

vi.mock("./WebGLImageViewerEngine", () => ({
  WebGLImageViewerEngine: vi.fn(() => {
    if (engineMocks.throwOnConstruct) {
      throw new Error("WebGL init failed");
    }

    return {
      destroy: engineMocks.destroy,
      isTileOutlineEnabled: engineMocks.isTileOutlineEnabled,
      loadImage: engineMocks.loadImage,
      resetView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getScale: vi.fn(() => 1),
      setTileOutlineEnabled: vi.fn(),
    };
  }),
}));

describe("WebGLImageViewer", () => {
  afterEach(() => {
    cleanup();
    engineMocks.throwOnConstruct = false;
    vi.clearAllMocks();
  });

  it("creates and disposes the viewer engine", () => {
    const { unmount } = render(
      <WebGLImageViewer src="blob:photo" width={100} height={80} />,
    );

    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1);
    expect(engineMocks.loadImage).toHaveBeenCalledWith("blob:photo", 100, 80);

    unmount();

    expect(engineMocks.destroy).toHaveBeenCalledTimes(1);
  });

  it("reports engine initialization failures without throwing from the effect", () => {
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
    expect(engineMocks.loadImage).not.toHaveBeenCalled();
  });

  it("reports image loading failures through the error callback", async () => {
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
  });
});
