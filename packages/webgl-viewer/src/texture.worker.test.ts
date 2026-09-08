import { afterEach, describe, expect, it, vi } from "vitest";

import { createTextureWorkerHandler } from "./texture-worker-runtime";
import type { TextureWorkerRequest } from "./worker-protocol";

function bootWorker() {
  const postMessage = vi.fn();
  const handleMessage = createTextureWorkerHandler(postMessage);
  return {
    postMessage,
    onmessage: (event: { data: TextureWorkerRequest }) =>
      handleMessage(event.data),
  };
}

const createTileMessage = (key: string): { data: TextureWorkerRequest } => ({
  data: {
    type: "create-tile",
    payload: {
      sessionId: 1,
      imageHeight: 3000,
      imageWidth: 4000,
      key,
      lodLevel: 2,
      x: 1,
      y: 1,
    },
  },
});

const loadMessage = (sessionId = 1): { data: TextureWorkerRequest } => ({
  data: {
    type: "load-image",
    payload: {
      sessionId,
      blob: new Blob(["photo"]),
      url: "/photo.jpg",
      maxTextureSize: 4096,
      maxTextureBytes: 64 * 1024 * 1024,
    },
  },
});

const bitmap = (): ImageBitmap & { close: ReturnType<typeof vi.fn> } => ({
  width: 4000,
  height: 3000,
  close: vi.fn(),
});

describe("texture.worker create-tile guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts tile-error when a tile is requested before any image is loaded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = bootWorker();

    await worker.onmessage!(createTileMessage("2-1-1"));

    // 静默丢弃会让 key 永远留在引擎的 loadingTiles 里不再被重新请求，
    // 必须以 tile-error 回应（引擎路由 tile-error → markFailed → 重排队）。
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "tile-error",
      sessionId: 1,
      payload: { key: "2-1-1", error: "image not loaded" },
    });
  });

  it("posts tile-error for tiles interleaved with a context-restore reload", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fullBitmap = { close: vi.fn(), height: 3000, width: 4000 };
    const createImageBitmap = vi
      .fn()
      .mockResolvedValueOnce(fullBitmap)
      .mockResolvedValueOnce({ height: 1500, width: 2000 })
      // 恢复窗口内的重新解码：保持 pending，模拟大图解码尚未完成
      .mockReturnValueOnce(new Promise(() => {}));
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const worker = bootWorker();
    const loadMessage: { data: TextureWorkerRequest } = {
      data: {
        type: "load-image",
        payload: {
          sessionId: 1,
          blob: new Blob(["x"]),
          maxTextureSize: 4096,
          maxTextureBytes: 64 * 1024 * 1024,
          url: "blob:p",
        },
      },
    };

    await worker.onmessage!(loadMessage);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "init-done",
      sessionId: 1,
    });

    // Context restore reloads through the same live worker: the old bitmap is
    // closed up front and originalImage stays null until the decode resolves.
    void worker.onmessage!(loadMessage);
    expect(fullBitmap.close).toHaveBeenCalledTimes(1);

    worker.postMessage.mockClear();
    await worker.onmessage!(createTileMessage("2-1-1"));

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "tile-error",
      sessionId: 1,
      payload: { key: "2-1-1", error: "image not loaded" },
    });
  });

  it("drops an older decode that finishes after a newer generation", async () => {
    let resolveOld!: (bitmap: { close: ReturnType<typeof vi.fn> }) => void;
    const oldBitmapPromise = new Promise<{ close: ReturnType<typeof vi.fn> }>(
      (resolve) => {
        resolveOld = resolve;
      },
    );
    const oldBitmap = { close: vi.fn() };
    const currentBitmap = { close: vi.fn(), height: 800, width: 1200 };
    const currentBase = { close: vi.fn(), height: 400, width: 600 };
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockReturnValueOnce(oldBitmapPromise)
        .mockResolvedValueOnce(currentBitmap)
        .mockResolvedValueOnce(currentBase),
    );
    const worker = bootWorker();
    const load = (sessionId: number): { data: TextureWorkerRequest } => ({
      data: {
        type: "load-image",
        payload: {
          sessionId,
          blob: new Blob([String(sessionId)]),
          maxTextureSize: 4096,
          maxTextureBytes: 64 * 1024 * 1024,
          url: `blob:${sessionId}`,
        },
      },
    });

    const staleLoad = worker.onmessage!(load(1));
    await worker.onmessage!(load(2));
    resolveOld(oldBitmap);
    await staleLoad;

    expect(oldBitmap.close).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image-loaded", sessionId: 2 }),
      [currentBase],
    );
    expect(worker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 1 }),
      expect.anything(),
    );
  });

  it("decodes base and tile bitmaps with the same alpha policy", async () => {
    const decoded = { close: vi.fn(), height: 3000, width: 4000 };
    const base = { close: vi.fn(), height: 1500, width: 2000 };
    const tile = { close: vi.fn(), height: 512, width: 512 };
    const createImageBitmap = vi
      .fn()
      .mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(tile);
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const worker = bootWorker();

    await worker.onmessage!({
      data: {
        type: "load-image",
        payload: {
          sessionId: 1,
          blob: new Blob(["photo"]),
          maxTextureSize: 4096,
          maxTextureBytes: 64 * 1024 * 1024,
          url: "blob:photo",
        },
      },
    });
    await worker.onmessage!(createTileMessage("1-1-2"));

    expect(createImageBitmap.mock.calls[0]?.[1]).toMatchObject({
      premultiplyAlpha: "none",
    });
    expect(createImageBitmap.mock.calls[1]?.[1]).toMatchObject({
      premultiplyAlpha: "none",
    });
    expect(createImageBitmap.mock.calls[2]?.at(-1)).toMatchObject({
      premultiplyAlpha: "none",
    });
  });

  it.each(["image-loaded", "tile-created"] as const)(
    "closes an untransferred bitmap when posting %s fails",
    async (type) => {
      const original = bitmap();
      const base = bitmap();
      const tile = bitmap();
      vi.stubGlobal(
        "createImageBitmap",
        vi
          .fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce(base)
          .mockResolvedValueOnce(tile),
      );
      const worker = bootWorker();
      worker.postMessage.mockImplementation((message) => {
        if (message.type === type) throw new Error("transfer failed");
      });
      await worker.onmessage(loadMessage());
      if (type === "tile-created")
        await worker.onmessage(createTileMessage("1-1-2"));

      expect(
        type === "image-loaded" ? base.close : tile.close,
      ).toHaveBeenCalledTimes(1);
      expect(original.close).toHaveBeenCalledTimes(
        type === "image-loaded" ? 1 : 0,
      );
      expect(worker.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: type === "image-loaded" ? "load-error" : "tile-error",
          payload: expect.objectContaining({ error: "transfer failed" }),
        }),
      );
    },
  );

  it.each(["base", "tile"] as const)(
    "closes a late %s decode after reload, even when the caller reuses a session ID",
    async (stage) => {
      const oldOriginal = bitmap();
      const oldBase = bitmap();
      const lateBitmap = bitmap();
      const currentOriginal = bitmap();
      const currentBase = bitmap();
      const deferred = Promise.withResolvers<ImageBitmap>();
      const decode = vi.fn().mockResolvedValueOnce(oldOriginal);
      if (stage === "tile") decode.mockResolvedValueOnce(oldBase);
      decode
        .mockReturnValueOnce(deferred.promise)
        .mockResolvedValueOnce(currentOriginal)
        .mockResolvedValueOnce(currentBase);
      vi.stubGlobal("createImageBitmap", decode);
      const worker = bootWorker();
      const firstLoad = worker.onmessage(loadMessage());
      let pending: Promise<void>;
      if (stage === "tile") {
        await firstLoad;
        pending = worker.onmessage(createTileMessage("1-1-2"));
      } else {
        await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2));
        pending = firstLoad;
      }
      worker.postMessage.mockClear();
      await worker.onmessage(loadMessage());
      deferred.resolve(lateBitmap);
      await pending;

      expect(oldOriginal.close).toHaveBeenCalledTimes(1);
      expect(lateBitmap.close).toHaveBeenCalledTimes(1);
      expect(currentOriginal.close).not.toHaveBeenCalled();
      expect(worker.postMessage).toHaveBeenCalledTimes(2);
      expect(worker.postMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: "image-loaded" }),
        [currentBase],
      );
    },
  );

  it("reports HTTP failure without decoding a response error page", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    const worker = bootWorker();
    await worker.onmessage({
      data: {
        type: "load-image",
        payload: {
          sessionId: 1,
          blob: null,
          url: "/missing.jpg",
          maxTextureSize: 4096,
          maxTextureBytes: 0,
        },
      },
    });
    expect(decode).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "load-error",
      sessionId: 1,
      payload: { error: "Image request failed: 404" },
    });
  });
});
