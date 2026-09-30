import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleGalleryPreload } from "../gallery-preload";

describe("gallery destination preload", () => {
  let cleanup: (() => void) | undefined;
  let readyState: DocumentReadyState;
  let visibilityState: DocumentVisibilityState;
  let online: boolean;
  let idleCallbacks: IdleRequestCallback[];

  beforeEach(() => {
    vi.useFakeTimers();
    readyState = "complete";
    visibilityState = "visible";
    online = true;
    idleCallbacks = [];
    vi.spyOn(document, "readyState", "get").mockImplementation(
      () => readyState,
    );
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function flushIdle() {
    for (const callback of idleCallbacks.splice(0))
      callback({ didTimeout: false, timeRemaining: () => 50 });
    await Promise.resolve();
  }

  it("waits for initial resources and a paint window, then starts only once", async () => {
    readyState = "loading";
    const preload = vi.fn(async () => {});
    cleanup = scheduleGalleryPreload(preload);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    readyState = "complete";
    window.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(299);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(preload).not.toHaveBeenCalled();
    await flushIdle();
    expect(preload).toHaveBeenCalledOnce();
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(3_000);
    await flushIdle();
    expect(preload).toHaveBeenCalledOnce();
  });

  it("warms core destinations on mobile and slow connections too", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "2g", saveData: true },
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 2,
    });
    const preload = vi.fn(async () => {});
    try {
      cleanup = scheduleGalleryPreload(preload);
      await vi.advanceTimersByTimeAsync(300);
      await flushIdle();
      expect(preload).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(navigator, "connection");
      Reflect.deleteProperty(navigator, "deviceMemory");
    }
  });

  it("rechecks visibility and connectivity at execution, then resumes", async () => {
    const preload = vi.fn(async () => {});
    cleanup = scheduleGalleryPreload(preload);
    await vi.advanceTimersByTimeAsync(300);
    visibilityState = "hidden";
    await flushIdle();
    expect(preload).not.toHaveBeenCalled();
    visibilityState = "visible";
    online = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(300);
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    online = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(300);
    await flushIdle();
    expect(preload).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "cancels scheduled work on navigation (idle scheduled: %s)",
    async (scheduledIdle) => {
      const preload = vi.fn(async () => {});
      cleanup = scheduleGalleryPreload(preload);
      if (scheduledIdle) await vi.advanceTimersByTimeAsync(300);
      cleanup();
      window.dispatchEvent(new Event("load"));
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(3_000);
      await flushIdle();
      expect(preload).not.toHaveBeenCalled();
      if (scheduledIdle) expect(cancelIdleCallback).toHaveBeenCalledWith(1);
    },
  );

  it("uses the delayed fallback without idle callbacks and consumes failed warmups", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const preload = vi.fn(async () => {
      throw new Error("Chunk temporarily unavailable");
    });
    cleanup = scheduleGalleryPreload(preload);
    await vi.advanceTimersByTimeAsync(299);
    expect(preload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(preload).toHaveBeenCalledOnce();
  });
});
