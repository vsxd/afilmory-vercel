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
      window.dispatchEvent(new ErrorEvent("error"));
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
        new ErrorEvent("error", {
          message: "private-photo-url",
          filename: "private-script-url",
          error: new Error("private-error-details"),
        }),
      );
      for (const tag of ["img", "script", "link", "video", "audio", "object"]) {
        const resource = document.createElement(tag);
        resource.setAttribute(
          tag === "link" ? "href" : "src",
          "private-resource-url",
        );
        document.body.append(resource);
        // Resource errors do not bubble; the window capture listener still
        // receives them without inspecting their URLs or error payloads.
        resource.dispatchEvent(new Event("error"));
      }
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
        pageErrors: 7,
        errorCounts: {
          runtime: 1,
          img: 1,
          script: 1,
          link: 1,
          video: 1,
          audio: 1,
          other: 1,
        },
        unhandledRejections: 1,
        hiddenTransitions: 1,
        longTasks: { supported: false },
      });
      expect(JSON.stringify(result)).not.toContain("private-");
      expect(callback).toBeUndefined();
      window.dispatchEvent(new ErrorEvent("error"));
      expect(result.metrics.pageErrors).toBe(7);
      command("start", 2);
      command("stop", 2);
      const nextResult = post.mock.calls.find(
        ([message]) => message.type === "result" && message.runId === 2,
      )![0];
      expect(nextResult.metrics.pageErrors).toBe(0);
      expect(Object.values(nextResult.metrics.errorCounts)).toEqual(
        Array.from({ length: 7 }, () => 0),
      );
    } finally {
      document.body.innerHTML = "";
    }
  });
});
