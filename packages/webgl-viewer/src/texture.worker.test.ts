import type { Mock } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTextureWorkerHandler } from "./texture-worker-runtime";
import type { TextureWorkerRequest } from "./worker-protocol";

function bootWorker() {
  const postMessage = vi.fn();
  const handleMessage = createTextureWorkerHandler(postMessage);
  return { postMessage, handleMessage };
}

const createTileMessage = (
  key = "1-1-2",
): Extract<TextureWorkerRequest, { type: "create-tile" }> => ({
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
});

// A complete dimension header; bitmap creation stays mocked.
function imageBlob(): Blob {
  const bytes = new Uint8Array(13);
  bytes.set(new TextEncoder().encode("GIF89a"));
  const view = new DataView(bytes.buffer);
  view.setUint16(6, 4000, true);
  view.setUint16(8, 3000, true);
  return new Blob([bytes]);
}

const loadMessage = (
  sessionId = 1,
  skipBaseTexture = false,
): Extract<TextureWorkerRequest, { type: "load-image" }> => ({
  type: "load-image",
  payload: {
    sessionId,
    blob: imageBlob(),
    url: "/photo.jpg",
    maxTextureSize: 4096,
    maxTextureBytes: 64 * 1024 * 1024,
    skipBaseTexture,
  },
});

const bitmap = (
  width = 4000,
  height = 3000,
): ImageBitmap & { close: Mock<() => void> } => ({
  width,
  height,
  close: vi.fn<() => void>(),
});

describe("texture worker lazy source decoding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("decodes only the base from compressed bytes before any zoom request", async () => {
    const base = bitmap(2000, 1500);
    const decode = vi.fn().mockResolvedValue(base);
    vi.stubGlobal("createImageBitmap", decode);
    const worker = bootWorker();
    const load = loadMessage();
    await worker.handleMessage(load);

    expect(decode).toHaveBeenCalledExactlyOnceWith(
      load.payload.blob,
      expect.objectContaining({
        imageOrientation: "from-image",
        premultiplyAlpha: "none",
        resizeWidth: 2000,
        resizeHeight: 1500,
      }),
    );
    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        type: "image-loaded",
        sessionId: 1,
        payload: {
          imageBitmap: base,
          imageWidth: 4000,
          imageHeight: 3000,
          sourceWidth: 4000,
          sourceHeight: 3000,
          lodLevel: 1,
        },
      },
      [base],
    );
    expect(base.close).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "init-done",
      sessionId: 1,
    });
  });

  it.each([imageBlob(), new Blob(["unknown header"])])(
    "skips every bitmap decode when a cached base already exists (%#)",
    async (blob) => {
      const decode = vi.fn();
      vi.stubGlobal("createImageBitmap", decode);
      const worker = bootWorker();
      const load = loadMessage(1, true);
      if (load.type === "load-image") load.payload.blob = blob;
      await worker.handleMessage(load);

      expect(decode).not.toHaveBeenCalled();
      expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
        type: "init-done",
        sessionId: 1,
      });
    },
  );

  it("shares one source decode across concurrent tile requests", async () => {
    const source = bitmap();
    const deferred = Promise.withResolvers<ImageBitmap>();
    const decode = vi
      .fn()
      .mockReturnValueOnce(deferred.promise)
      .mockImplementation(async () => bitmap(500, 500));
    vi.stubGlobal("createImageBitmap", decode);
    const worker = bootWorker();
    await worker.handleMessage(loadMessage(1, true));
    const first = worker.handleMessage(createTileMessage("first"));
    const second = worker.handleMessage(createTileMessage("second"));
    expect(decode).toHaveBeenCalledTimes(1);

    deferred.resolve(source);
    await Promise.all([first, second]);
    expect(decode).toHaveBeenCalledTimes(3);
    expect(decode.mock.calls[1][0]).toBe(source);
    expect(decode.mock.calls[2][0]).toBe(source);
    expect(decode.mock.calls[1].at(-1)).toMatchObject({
      premultiplyAlpha: "none",
    });
    expect(source.close).not.toHaveBeenCalled();
    expect(
      worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "source-ready",
      ),
    ).toEqual([
      [
        {
          type: "source-ready",
          sessionId: 1,
          payload: { sourceWidth: 4000, sourceHeight: 3000 },
        },
      ],
    ]);

    await worker.handleMessage(loadMessage(2, true));
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("posts tile-error while a reload has not initialized its compressed source", async () => {
    const worker = bootWorker();
    await worker.handleMessage(createTileMessage());
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "tile-error",
      sessionId: 1,
      payload: { key: "1-1-2", error: "image not loaded" },
    });

    await worker.handleMessage(loadMessage(1, true));
    const deferred = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => deferred.promise),
    );
    const reload = loadMessage();
    if (reload.type === "load-image") reload.payload.blob = null;
    const pending = worker.handleMessage(reload);
    worker.postMessage.mockClear();
    await worker.handleMessage(createTileMessage());
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "tile-error",
      sessionId: 1,
      payload: { key: "1-1-2", error: "image not loaded" },
    });
    deferred.resolve(new Response("missing", { status: 404 }));
    await pending;
  });

  it.each(["base", "source", "tile"] as const)(
    "closes a late %s bitmap after reload, even if the session ID is reused",
    async (stage) => {
      const late = bitmap(
        stage === "base" ? 2000 : 4000,
        stage === "base" ? 1500 : 3000,
      );
      const source = bitmap();
      const deferred = Promise.withResolvers<ImageBitmap>();
      const decode = vi.fn();
      if (stage === "tile") decode.mockResolvedValueOnce(source);
      decode.mockReturnValueOnce(deferred.promise);
      vi.stubGlobal("createImageBitmap", decode);
      const worker = bootWorker();
      let pending: Promise<void>;
      if (stage === "base") {
        pending = worker.handleMessage(loadMessage());
      } else {
        await worker.handleMessage(loadMessage(1, true));
        pending = worker.handleMessage(createTileMessage());
      }
      await vi.waitFor(() =>
        expect(decode).toHaveBeenCalledTimes(stage === "tile" ? 2 : 1),
      );
      await worker.handleMessage(loadMessage(1, true));
      worker.postMessage.mockClear();
      deferred.resolve(late);
      await pending;

      expect(late.close).toHaveBeenCalledOnce();
      expect(source.close).toHaveBeenCalledTimes(stage === "tile" ? 1 : 0);
      expect(worker.postMessage).not.toHaveBeenCalled();
    },
  );

  it.each(["image-loaded", "tile-created"] as const)(
    "closes an untransferred bitmap when posting %s fails",
    async (type) => {
      const base = bitmap(2000, 1500);
      const source = bitmap();
      const tile = bitmap(500, 500);
      const decode = vi.fn();
      if (type === "image-loaded") decode.mockResolvedValueOnce(base);
      else decode.mockResolvedValueOnce(source).mockResolvedValueOnce(tile);
      vi.stubGlobal("createImageBitmap", decode);
      const worker = bootWorker();
      worker.postMessage.mockImplementation((message) => {
        if (message.type === type) throw new Error("transfer failed");
      });
      await worker.handleMessage(loadMessage(1, type === "tile-created"));
      if (type === "tile-created")
        await worker.handleMessage(createTileMessage());

      expect(
        type === "image-loaded" ? base.close : tile.close,
      ).toHaveBeenCalledOnce();
      expect(source.close).not.toHaveBeenCalled();
      expect(worker.postMessage).toHaveBeenLastCalledWith({
        type: type === "image-loaded" ? "load-error" : "tile-error",
        sessionId: 1,
        payload: {
          ...(type === "tile-created" ? { key: "1-1-2" } : {}),
          error: "transfer failed",
        },
      });
    },
  );

  it("reports a shared source decode failure to every waiting tile and permits retry", async () => {
    const deferred = Promise.withResolvers<ImageBitmap>();
    const decode = vi.fn().mockReturnValueOnce(deferred.promise);
    vi.stubGlobal("createImageBitmap", decode);
    const worker = bootWorker();
    await worker.handleMessage(loadMessage(1, true));
    const first = worker.handleMessage(createTileMessage("first"));
    const second = worker.handleMessage(createTileMessage("second"));
    deferred.reject(new Error("decode failed"));
    await Promise.all([first, second]);
    for (const key of ["first", "second"]) {
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: "tile-error",
        sessionId: 1,
        payload: { key, error: "decode failed" },
      });
    }
    decode
      .mockResolvedValueOnce(bitmap())
      .mockResolvedValueOnce(bitmap(500, 500));
    await worker.handleMessage(createTileMessage());
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "tile-created" }),
      expect.any(Array),
    );
  });

  it("rejects invalid tile coordinates before decoding the source", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const worker = bootWorker();
    await worker.handleMessage(loadMessage(1, true));
    const tile = createTileMessage();
    if (tile.type === "create-tile") tile.payload.x = -1;
    await worker.handleMessage(tile);
    expect(decode).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "tile-error",
      sessionId: 1,
      payload: {
        key: "1-1-2",
        error: "Tile coordinates are outside the image",
      },
    });
  });

  it.each(["resize-error", "ignored-resize"] as const)(
    "releases every lazy source allocation on %s",
    async (failure) => {
      const oversized = bitmap(8000, 6000);
      const ignored = bitmap(8000, 6000);
      const decode = vi.fn().mockResolvedValueOnce(oversized);
      if (failure === "resize-error") {
        decode.mockRejectedValueOnce(new Error("resize failed"));
      } else {
        decode.mockResolvedValueOnce(ignored);
      }
      vi.stubGlobal("createImageBitmap", decode);
      const worker = bootWorker();
      const load = loadMessage(1, true);
      load.payload.blob = new Blob(["unknown header"]);
      load.payload.maxSourceBytes = 32 * 1024 * 1024;
      await worker.handleMessage(load);
      await worker.handleMessage(createTileMessage());

      expect(oversized.close).toHaveBeenCalledOnce();
      expect(ignored.close).toHaveBeenCalledTimes(
        failure === "ignored-resize" ? 1 : 0,
      );
      expect(worker.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "source-ready" }),
      );
      expect(worker.postMessage).toHaveBeenLastCalledWith({
        type: "tile-error",
        sessionId: 1,
        payload: {
          key: "1-1-2",
          error:
            failure === "resize-error"
              ? "resize failed"
              : "Decoded image exceeds source pixel budget",
        },
      });
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
    const load = loadMessage();
    if (load.type === "load-image") load.payload.blob = null;
    await worker.handleMessage(load);
    expect(decode).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "load-error",
      sessionId: 1,
      payload: { error: "Image request failed: 404" },
    });
  });
});
