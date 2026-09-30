// @vitest-environment node
import sharp from "sharp";
import { decode } from "tiff";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegularImageCache } from "../../image-cache-service";
import { ImageConversionService } from "../../image-conversion-service";
import { ImageLoaderManager } from "../../image-loader-manager";
import { ImageConverterManager } from "../manager";
import {
  TIFF_CONVERSION_TIMEOUT_MS,
  TiffConverterStrategy,
} from "../strategies/tiff";
import { DESKTOP_TIFF_BUDGET } from "../strategies/tiff-limits";
import type {
  TiffWorkerRequest,
  TiffWorkerResponse,
} from "../strategies/tiff-worker-protocol";

const platform = vi.hoisted(() => ({ safari: false, mobile: false }));
vi.mock("~/lib/device-viewport", () => ({
  get isSafari() {
    return platform.safari;
  },
  get isMobileDevice() {
    return platform.mobile;
  },
}));
vi.mock("~/lib/debug-log", () => ({ debugLog: vi.fn() }));
vi.mock("~/lib/file-type", () => ({
  detectFileTypeFromBlob: async () => ({ mime: "image/tiff", ext: "tiff" }),
}));

class WorkerMock {
  static instances: WorkerMock[] = [];
  onmessage: ((event: MessageEvent<TiffWorkerResponse>) => void) | null = null;
  onerror: ((event: Pick<ErrorEvent, "preventDefault">) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage =
    vi.fn<(request: TiffWorkerRequest, transfer: Transferable[]) => void>();
  terminate = vi.fn();
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    WorkerMock.instances.push(this);
  }
}

async function tinyBlob() {
  const bytes = await sharp(Buffer.from([255, 0, 0, 0, 0, 255, 0, 255]), {
    raw: { width: 2, height: 1, channels: 4 },
  })
    .tiff({ compression: "none" })
    .toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/tiff" });
}

function enableWorker() {
  vi.stubGlobal("Worker", WorkerMock);
  vi.stubGlobal("OffscreenCanvas", class {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  WorkerMock.instances = [];
  platform.safari = false;
  platform.mobile = false;
  vi.useRealTimers();
});

describe("TIFF worker ownership", () => {
  it("times out an unresponsive worker without falling back to native decoding", async () => {
    enableWorker();
    const source = await tinyBlob();
    vi.useFakeTimers();
    const converter = new ImageConverterManager();
    const cache = createRegularImageCache();
    const loader = new ImageLoaderManager(cache, {
      imageFetchService: { fetchBlob: async () => source, cleanup: () => {} },
      imageConversionService: new ImageConversionService(cache, converter),
    });
    const onEvent = vi.fn();
    const pending = loader.loadImage("unresponsive-tiff", { onEvent });
    const rejected = expect(pending).rejects.toMatchObject({
      stage: "convert",
      code: "timeout",
    });
    await vi.waitFor(() => expect(WorkerMock.instances).toHaveLength(1));
    const worker = WorkerMock.instances[0];
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(TIFF_CONVERSION_TIMEOUT_MS);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(
      onEvent.mock.calls.some(([event]) => event.type === "native-fallback"),
    ).toBe(false);
    expect(cache.size()).toBe(0);
    loader.cleanup();
    await converter.dispose();
    expect(converter.getPipelineStats()).toEqual({ active: 0, pending: 0 });
  });

  it.each(["success", "cancel", "error"] as const)(
    "clears the worker deadline on %s",
    async (outcome) => {
      enableWorker();
      const source = await tinyBlob();
      vi.useFakeTimers();
      const controller = new AbortController();
      const pending = new TiffConverterStrategy().convert(
        source,
        "photo",
        controller.signal,
      );
      const settled =
        outcome === "success"
          ? expect(pending).resolves.toMatchObject({ format: "image/png" })
          : expect(pending).rejects.toThrow();
      await vi.waitFor(() => expect(WorkerMock.instances).toHaveLength(1));
      const worker = WorkerMock.instances[0];
      expect(vi.getTimerCount()).toBe(1);
      if (outcome === "cancel") controller.abort();
      else if (outcome === "error")
        worker.onerror?.({ preventDefault: vi.fn() });
      else
        worker.onmessage?.({
          data: { type: "converted", blob: new Blob(), format: "image/png" },
        } as MessageEvent<TiffWorkerResponse>);
      await settled;
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(TIFF_CONVERSION_TIMEOUT_MS);
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );

  it("uses a module worker, transfers input bytes and terminates after success", async () => {
    enableWorker();
    const source = await tinyBlob();
    const pending = new TiffConverterStrategy().convert(source);
    await vi.waitFor(() => expect(WorkerMock.instances).toHaveLength(1));
    const worker = WorkerMock.instances[0];
    expect(worker.options).toEqual({ type: "module" });
    expect(worker.url.pathname).toContain("tiff.worker.ts");
    const [request, transfer] = worker.postMessage.mock.calls[0];
    expect(transfer).toEqual([request.bytes]);
    expect(request.budget).toEqual(DESKTOP_TIFF_BUDGET);
    const blob = new Blob(["converted"], { type: "image/png" });
    worker.onmessage?.({
      data: { type: "converted", blob, format: "image/png" },
    } as MessageEvent<TiffWorkerResponse>);
    await expect(pending).resolves.toEqual({
      blob,
      format: "image/png",
      originalSize: source.size,
      convertedSize: blob.size,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it("terminates and settles cancellation, ignoring a queued late result", async () => {
    enableWorker();
    const controller = new AbortController();
    const pending = new TiffConverterStrategy().convert(
      await tinyBlob(),
      "photo",
      controller.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(WorkerMock.instances).toHaveLength(1));
    const worker = WorkerMock.instances[0];
    const lateMessage = worker.onmessage;
    controller.abort();
    await rejected;
    lateMessage?.({
      data: { type: "converted", blob: new Blob(), format: "image/png" },
    } as MessageEvent<TiffWorkerResponse>);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it.each(["error", "messageerror", "resource-limit"] as const)(
    "settles a worker %s and releases it",
    async (failure) => {
      enableWorker();
      const pending = new TiffConverterStrategy().convert(await tinyBlob());
      const rejected =
        failure === "resource-limit"
          ? expect(pending).rejects.toMatchObject({ code: "resource-limit" })
          : expect(pending).rejects.toThrow(/worker/i);
      await vi.waitFor(() => expect(WorkerMock.instances).toHaveLength(1));
      const worker = WorkerMock.instances[0];
      if (failure === "error") worker.onerror?.({ preventDefault: vi.fn() });
      else if (failure === "messageerror") worker.onmessageerror?.();
      else
        worker.onmessage?.({
          data: { type: "error", code: "resource-limit" },
        } as MessageEvent<TiffWorkerResponse>);
      await rejected;
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );

  it("keeps shared work alive until the final subscriber cancels and drains its conversion slot", async () => {
    enableWorker();
    const manager = new ImageConverterManager({ maxConcurrent: 1 });
    const blob = await tinyBlob();
    const a = new AbortController();
    const b = new AbortController();
    const first = manager.convertImage(blob, "shared", undefined, a.signal);
    const second = manager.convertImage(blob, "shared", undefined, b.signal);
    const firstRejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const secondRejected = expect(second).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(WorkerMock.instances).toHaveLength(1));
    const worker = WorkerMock.instances[0];
    a.abort();
    await firstRejected;
    expect(worker.terminate).not.toHaveBeenCalled();
    b.abort();
    await secondRejected;
    await manager.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(manager.getPipelineStats()).toEqual({ active: 0, pending: 0 });
  });

  it("retains native Safari support but rejects an oversized TIFF before returning original bytes", async () => {
    platform.safari = true;
    const manager = new ImageConverterManager();
    const small = await tinyBlob();
    await expect(manager.convertImage(small, "small")).resolves.toMatchObject({
      kind: "original",
      reason: "native",
      blob: small,
    });
    const huge = await tinyBlob();
    Object.defineProperty(huge, "size", {
      value: DESKTOP_TIFF_BUDGET.maxBytes,
    });
    await expect(manager.convertImage(huge, "huge")).rejects.toMatchObject({
      code: "resource-limit",
    });
    expect(WorkerMock.instances).toHaveLength(0);
    await manager.dispose();
  });

  it("allows budgeted native Safari layouts that the JS pixel converter does not support", async () => {
    platform.safari = true;
    const bytes = await sharp(Buffer.from([255, 0, 0]), {
      raw: { width: 1, height: 1, channels: 3 },
    })
      .toColourspace("cmyk")
      .tiff({ compression: "none" })
      .toBuffer();
    expect(decode(bytes, { pages: [0], ignoreImageData: true })[0].type).toBe(
      5,
    );
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/tiff" });
    const manager = new ImageConverterManager();
    await expect(
      manager.convertImage(blob, "native-cmyk"),
    ).resolves.toMatchObject({ kind: "original", reason: "native", blob });
    await manager.dispose();
  });

  it("retains native Safari display of a budgeted multichannel tiled TIFF", async () => {
    platform.safari = true;
    const bytes = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "blue" },
    })
      .tiff({
        compression: "deflate",
        tile: true,
        tileWidth: 256,
        tileHeight: 256,
      })
      .toBuffer();
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/tiff" });
    const manager = new ImageConverterManager();
    await expect(
      manager.convertImage(blob, "native-tiled"),
    ).resolves.toMatchObject({ kind: "original", reason: "native", blob });
    expect(WorkerMock.instances).toHaveLength(0);
    await manager.dispose();
  });

  it.each([false, true])(
    "does not let the loader bypass a TIFF resource limit with native fallback (Safari: %s)",
    async (safari) => {
      platform.safari = safari;
      const converter = new ImageConverterManager();
      const cache = createRegularImageCache();
      const source = await tinyBlob();
      Object.defineProperty(source, "size", {
        value: DESKTOP_TIFF_BUDGET.maxBytes,
      });
      const loader = new ImageLoaderManager(cache, {
        imageFetchService: { fetchBlob: async () => source, cleanup: () => {} },
        imageConversionService: new ImageConversionService(cache, converter),
      });
      const onEvent = vi.fn();
      const createUrl = vi.spyOn(URL, "createObjectURL");
      await expect(
        loader.loadImage("oversized-tiff", { onEvent }),
      ).rejects.toMatchObject({ code: "resource-limit" });
      expect(
        onEvent.mock.calls.some(([event]) => event.type === "native-fallback"),
      ).toBe(false);
      expect(createUrl).not.toHaveBeenCalled();
      expect(cache.size()).toBe(0);
      loader.cleanup();
      await converter.dispose();
    },
  );
});

describe("TIFF worker conversion", () => {
  it("runs the worker entry with real transparent TIFF pixels and PNG encoding", async () => {
    const pixels = new Uint8ClampedArray(8);
    const encode = vi.fn(
      async ({ type }: ImageEncodeOptions) => new Blob(["encoded"], { type }),
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            createImageData: () => ({ data: pixels }),
            putImageData: vi.fn(),
          };
        }
        convertToBlob = encode;
      },
    );
    const scope: {
      onmessage:
        ((event: MessageEvent<TiffWorkerRequest>) => Promise<void>) | null;
      postMessage: ReturnType<typeof vi.fn>;
    } = { onmessage: null, postMessage: vi.fn() };
    vi.stubGlobal("self", scope);
    await import("../strategies/tiff.worker");
    await scope.onmessage?.({
      data: {
        bytes: await (await tinyBlob()).arrayBuffer(),
        budget: DESKTOP_TIFF_BUDGET,
      },
    } as MessageEvent<TiffWorkerRequest>);
    expect([...pixels]).toEqual([255, 0, 0, 0, 0, 255, 0, 255]);
    expect(encode).toHaveBeenCalledExactlyOnceWith({
      type: "image/png",
      quality: 0.9,
    });
    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "converted",
      blob: expect.any(Blob),
      format: "image/png",
    });
  });
});
