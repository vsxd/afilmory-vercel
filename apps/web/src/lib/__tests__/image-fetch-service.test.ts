import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectFileTypeFromBlob } from "../file-type";
import { ImageFetchService } from "../image-fetch-service";

vi.mock("../file-type", () => ({
  detectFileTypeFromBlob: vi.fn(async () => ({
    ext: "jpg",
    mime: "image/jpeg",
  })),
}));

class FakeXHR {
  static instances: FakeXHR[] = [];
  onload: (() => Promise<void>) | null = null;
  onprogress: ((event: ProgressEvent) => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 200;
  response = new Blob(["photo"]);
  responseType = "";
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    FakeXHR.instances.push(this);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("image request settlement", () => {
  it.each([403, 404, 503])(
    "preserves HTTP %i for a specific failure message",
    async (httpStatus) => {
      const service = new ImageFetchService(1000);
      const request = service.fetchBlob(
        "https://example.test/photo?signature=private",
        { priority: "high" },
      );
      const rejected = expect(request).rejects.toMatchObject({
        stage: "fetch",
        code: "http",
        httpStatus,
        message: `HTTP ${httpStatus}`,
      });
      await vi.advanceTimersByTimeAsync(0);
      const xhr = FakeXHR.instances[0];
      xhr.status = httpStatus;
      await xhr.onload?.();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["constructor", "open", "responseType", "send"] as const)(
    "settles synchronous %s failures with typed cause and permits retry",
    async (phase) => {
      const cause = new DOMException("Request blocked", "SecurityError");
      vi.stubGlobal(
        "XMLHttpRequest",
        class extends FakeXHR {
          constructor() {
            super();
            if (phase === "constructor") throw cause;
            if (phase === "responseType") {
              Object.defineProperty(this, "responseType", {
                set() {
                  throw cause;
                },
              });
            } else {
              this[phase].mockImplementation(() => {
                throw cause;
              });
            }
          }
        },
      );
      const service = new ImageFetchService(1000);
      const request = service.fetchBlob("blocked", { priority: "high" });
      const rejected = expect(request).rejects.toMatchObject({
        stage: "fetch",
        code: "network",
        cause,
      });
      await vi.advanceTimersByTimeAsync(0);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      service.cleanup();

      vi.stubGlobal("XMLHttpRequest", FakeXHR);
      const retry = service.fetchBlob("retry", { priority: "high" });
      await vi.advanceTimersByTimeAsync(0);
      const xhr = FakeXHR.instances.at(-1)!;
      await xhr.onload?.();
      await expect(retry).resolves.toBe(xhr.response);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects a stalled download with a typed timeout and detaches all handlers", async () => {
    const service = new ImageFetchService(1000);
    const result = service.fetchBlob("stalled", { priority: "high" });
    const assertion = expect(result).rejects.toMatchObject({
      stage: "fetch",
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    const xhr = FakeXHR.instances[0];
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(xhr.onload).toBeNull();
    expect(xhr.onprogress).toBeNull();
    service.cleanup();
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows long downloads while bytes advance, including unknown-length responses", async () => {
    const service = new ImageFetchService(1000);
    const result = service.fetchBlob("large", { priority: "high" });
    await vi.advanceTimersByTimeAsync(0);
    const xhr = FakeXHR.instances[0];
    for (let loaded = 1; loaded <= 3; loaded++) {
      await vi.advanceTimersByTimeAsync(900);
      xhr.onprogress?.(new ProgressEvent("progress", { loaded }));
    }
    await xhr.onload?.();
    await expect(result).resolves.toBe(xhr.response);
    expect(xhr.abort).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels during deferred format detection and ignores the late result after a replacement request", async () => {
    const detection = Promise.withResolvers<{
      ext: "jpg";
      mime: "image/jpeg";
    }>();
    vi.mocked(detectFileTypeFromBlob).mockReturnValueOnce(detection.promise);
    const service = new ImageFetchService(1000);
    const first = service.fetchBlob("old", { priority: "high" });
    const cancelled = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(0);
    const decoding = FakeXHR.instances[0].onload?.();
    const second = service.fetchBlob("new", { priority: "high" });
    await cancelled;
    await vi.advanceTimersByTimeAsync(0);
    detection.resolve({ ext: "jpg", mime: "image/jpeg" });
    await decoding;
    await FakeXHR.instances[1].onload?.();
    await expect(second).resolves.toBe(FakeXHR.instances[1].response);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["network", "http", "invalid-image", "detection-failed"])(
    "retains %s failures and permits retry",
    async (code) => {
      const service = new ImageFetchService(1000);
      const first = service.fetchBlob("failed", { priority: "high" });
      const assertion = expect(first).rejects.toMatchObject({ code });
      await vi.advanceTimersByTimeAsync(0);
      const xhr = FakeXHR.instances[0];
      if (code === "network") xhr.onerror?.();
      else {
        if (code === "http") xhr.status = 503;
        if (code === "invalid-image") xhr.response = new Blob([]);
        if (code === "detection-failed")
          vi.mocked(detectFileTypeFromBlob).mockRejectedValueOnce(
            new Error("detector failed"),
          );
        await xhr.onload?.();
      }
      await assertion;
      const retry = service.fetchBlob("retry", { priority: "high" });
      await vi.advanceTimersByTimeAsync(0);
      await FakeXHR.instances[1].onload?.();
      await expect(retry).resolves.toBe(FakeXHR.instances[1].response);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
