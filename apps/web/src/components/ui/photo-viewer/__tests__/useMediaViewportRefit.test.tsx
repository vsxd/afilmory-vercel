import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaViewportRefit } from "../useMediaViewportRefit";

describe("mobile media viewport refit", () => {
  let notifyResize: () => void;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const disconnect = vi.fn();

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    disconnect.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function paint() {
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
  }

  it("refits on entering the mobile breakpoint even when its first measurement is already the new size", () => {
    const viewport = document.createElement("div");
    const ref = { current: viewport };
    const refit = vi.fn();
    const { rerender } = renderHook(
      ({ mobile }) => useMediaViewportRefit(ref, mobile, refit),
      {
        initialProps: { mobile: false },
      },
    );
    paint();
    expect(refit).not.toHaveBeenCalled();

    rerender({ mobile: true });
    act(() => notifyResize());
    paint();
    expect(refit).toHaveBeenCalledTimes(1);
    act(() => notifyResize());
    paint();
    expect(refit).toHaveBeenCalledTimes(1);
  });

  it("fits the settled panel size once and cancels pending work when leaving the photo", () => {
    const viewport = document.createElement("div");
    let height = 500;
    Object.defineProperty(viewport, "clientHeight", { get: () => height });
    const ref = { current: viewport };
    const fittedHeights: number[] = [];
    const refit = () => fittedHeights.push(viewport.clientHeight);
    const { unmount } = renderHook(() =>
      useMediaViewportRefit(ref, true, refit),
    );
    paint();
    act(() => {
      height = 300;
      notifyResize();
      height = 240;
      notifyResize();
    });
    paint();
    expect(fittedHeights).toEqual([500, 240]);

    act(() => {
      height = 200;
      notifyResize();
    });
    unmount();
    paint();
    expect(fittedHeights).toEqual([500, 240]);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
