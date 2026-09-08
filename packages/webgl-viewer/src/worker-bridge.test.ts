import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clampDimensionsToFit } from "./texture-dimensions";
import { TextureWorkerBridge } from "./worker-bridge";

class WorkerMock {
  static instances: WorkerMock[] = [];
  static throwOnConstruct = false;

  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  url: URL;
  options?: WorkerOptions;

  constructor(url: URL, options?: WorkerOptions) {
    if (WorkerMock.throwOnConstruct) {
      throw new Error("worker construction failed");
    }
    this.url = url;
    this.options = options;
    WorkerMock.instances.push(this);
  }
}

describe("clampDimensionsToFit", () => {
  it("keeps dimensions that already fit", () => {
    expect(clampDimensionsToFit(4000, 3000, 4096)).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it("scales oversized dimensions down to the cap, preserving aspect ratio", () => {
    // 10000px 原图 → 0.5x 底图 5000px：老 GPU 的 4096 上限会让 texImage2D 失败
    expect(clampDimensionsToFit(5000, 3750, 4096)).toEqual({
      width: 4096,
      height: 3072,
    });
    // 高度主导的情况
    expect(clampDimensionsToFit(1000, 8192, 4096)).toEqual({
      width: 500,
      height: 4096,
    });
  });

  it("never produces a dimension below 1", () => {
    expect(clampDimensionsToFit(10_000, 1, 4096)).toEqual({
      width: 4096,
      height: 1,
    });
  });

  it("passes dimensions through when the cap is unknown (0 / negative)", () => {
    expect(clampDimensionsToFit(9000, 9000, 0)).toEqual({
      width: 9000,
      height: 9000,
    });
    expect(clampDimensionsToFit(9000, 9000, -1)).toEqual({
      width: 9000,
      height: 9000,
    });
  });

  it("also caps the RGBA allocation by byte budget", () => {
    expect(clampDimensionsToFit(8192, 8192, 16384, 64 * 1024 * 1024)).toEqual({
      width: 4096,
      height: 4096,
    });
  });
});

describe("TextureWorkerBridge", () => {
  beforeEach(() => {
    WorkerMock.instances = [];
    WorkerMock.throwOnConstruct = false;
    vi.stubGlobal("Worker", WorkerMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a texture worker and wires message handlers", () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    const onMessageError = vi.fn();

    new TextureWorkerBridge({ onError, onMessage, onMessageError });

    expect(WorkerMock.instances).toHaveLength(1);
    expect(WorkerMock.instances[0]).toMatchObject({
      onerror: onError,
      onmessageerror: onMessageError,
      onmessage: onMessage,
      options: { name: "texture-worker", type: "module" },
    });
    expect(WorkerMock.instances[0]?.url.pathname).toMatch(
      /texture\.worker\.ts$/,
    );
  });

  it("posts image and tile messages with stable payloads", () => {
    const bridge = new TextureWorkerBridge({ onMessage: vi.fn() });
    const worker = WorkerMock.instances[0];
    const blob = new Blob(["photo"], { type: "image/jpeg" });

    bridge.loadImage({
      blob,
      sessionId: 7,
      maxTextureSize: 4096,
      maxTextureBytes: 64 * 1024 * 1024,
      url: "https://example.com/photo.jpg",
    });
    bridge.createTile({
      sessionId: 7,
      imageHeight: 3000,
      imageWidth: 4000,
      key: "1-2-3",
      lodLevel: 3,
      x: 1,
      y: 2,
    });

    expect(worker.postMessage).toHaveBeenNthCalledWith(1, {
      payload: {
        blob,
        sessionId: 7,
        maxTextureSize: 4096,
        maxTextureBytes: 64 * 1024 * 1024,
        url: "https://example.com/photo.jpg",
      },
      type: "load-image",
    });
    expect(worker.postMessage).toHaveBeenNthCalledWith(2, {
      payload: {
        imageHeight: 3000,
        imageWidth: 4000,
        sessionId: 7,
        key: "1-2-3",
        lodLevel: 3,
        x: 1,
        y: 2,
      },
      type: "create-tile",
    });
  });

  it("retains the bitmap receiver and terminates exactly once on dispose", () => {
    const bridge = new TextureWorkerBridge({ onMessage: vi.fn() });
    const worker = WorkerMock.instances[0];

    bridge.dispose();
    bridge.dispose();

    expect(worker.onmessage).not.toBeNull();
    expect(worker).toMatchObject({ onerror: null, onmessageerror: null });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("propagates Worker construction failure to the engine fallback", () => {
    WorkerMock.throwOnConstruct = true;

    expect(() => new TextureWorkerBridge({ onMessage: vi.fn() })).toThrow(
      /worker construction failed/,
    );
  });
});
