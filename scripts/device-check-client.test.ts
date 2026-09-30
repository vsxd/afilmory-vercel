// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { installDeviceProbe } from "./device-check-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("device measurement probe", () => {
  it("excludes background gaps and sends counts without error text or resource URLs", () => {
    document.body.innerHTML = "<canvas></canvas>";
    try {
      vi.stubGlobal("PerformanceObserver", undefined);
      let callback: FrameRequestCallback | undefined;
      vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
        callback = next;
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {
        callback = undefined;
      });
      let hidden = false;
      vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
      const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
      installDeviceProbe();
      const command = (type: string, runId = 1) => {
        const event = new MessageEvent("message", {
          origin: window.location.origin,
          source: window,
          data: { channel: "afilmory-device-check", type, runId },
        });
        return window.dispatchEvent(event);
      };
      command("start");
      callback?.(0);
      callback?.(16);
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      callback?.(1000);
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      callback?.(2000);
      callback?.(2033);
      const canvas = document.querySelector("canvas")!;
      canvas.dispatchEvent(new Event("webglcontextlost"));
      canvas.dispatchEvent(new Event("webglcontextrestored"));
      window.dispatchEvent(
        new ErrorEvent("error", { message: "private-photo-url" }),
      );
      window.dispatchEvent(new Event("unhandledrejection"));
      command("stop", 0);
      expect(
        post.mock.calls.filter(([message]) => message.type === "result"),
      ).toHaveLength(0);
      command("stop");
      const results = post.mock.calls.filter(
        ([message]) => message.type === "result",
      );
      expect(results).toHaveLength(1);
      const result = results[0][0];
      expect(result.metrics.frames).toMatchObject({
        count: 2,
        p50Ms: 16,
        maxMs: 33,
        over50Ms: 0,
      });
      expect(result.metrics).toMatchObject({
        contextLost: 1,
        contextRestored: 1,
        pageErrors: 1,
        unhandledRejections: 1,
        hiddenTransitions: 1,
        longTasks: { supported: false },
      });
      expect(JSON.stringify(result)).not.toContain("private-photo-url");
      expect(callback).toBeUndefined();
    } finally {
      document.body.innerHTML = "";
    }
  });
});
