import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FrameRenderScheduler } from "./frame-render-scheduler";

describe("FrameRenderScheduler", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;

  beforeEach(() => {
    frames = new Map();
    nextId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++nextId, callback);
        return nextId;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => frames.delete(id)),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("coalesces requests and continues only while a frame reports work", () => {
    const onFrame = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const scheduler = new FrameRenderScheduler(onFrame);
    scheduler.request();
    scheduler.request();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    frames.get(1)!(16);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    frames.get(2)!(32);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(onFrame.mock.calls).toEqual([[16], [32]]);
  });

  it("flushes a first image immediately and ignores the cancelled callback", () => {
    const onFrame = vi.fn(() => false);
    const scheduler = new FrameRenderScheduler(onFrame);
    scheduler.request();
    const staleFrame = frames.get(1)!;
    scheduler.flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    staleFrame(16);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });
});
