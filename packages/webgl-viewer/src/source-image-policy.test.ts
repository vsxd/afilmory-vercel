// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSourceImageByteBudget,
  getSourceImageScale,
  MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
  selectSourceLimitedLod,
  SOURCE_IMAGE_BYTE_BUDGET,
  sourceImageDimensions,
} from "./source-image-policy";
import { createTextureWorkerHandler } from "./texture-worker-runtime";

afterEach(() => vi.unstubAllGlobals());

// Header-only bytes; createImageBitmap is mocked, so no large pixels are allocated.
function pngHeaderBlob(width: number, height: number): Blob {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.set([73, 69, 78, 68], 37); // zero-length IEND; pixel decode stays mocked
  return new Blob([bytes], { type: "image/png" });
}

function jpegHeaderBlob(width: number, height: number): Blob {
  return new Blob(
    [
      new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xc0,
        0,
        11,
        8,
        height >> 8,
        height & 255,
        width >> 8,
        width & 255,
        1,
        1,
        0x11,
        0,
        0xff,
        0xd9,
      ]),
    ],
    { type: "image/jpeg" },
  );
}

describe("retained source pixel budget", () => {
  it("caps LOD at the first grid reaching the available source density", () => {
    expect(
      getSourceImageScale(
        { width: 8000, height: 6000 },
        { width: 4000, height: 3000 },
      ),
    ).toBe(0.5);
    expect(
      getSourceImageScale(
        { width: 8000, height: 6000 },
        { width: 4000, height: 2999 },
      ),
    ).toBe(2999 / 6000);
    expect(selectSourceLimitedLod(8, 1)).toBe(2);
    expect(selectSourceLimitedLod(8, 0.6)).toBe(2);
    expect(selectSourceLimitedLod(8, 0.4)).toBe(1);
    expect(selectSourceLimitedLod(8, 0.1)).toBe(0);
    expect(selectSourceLimitedLod(0.3, 1)).toBe(1);
  });
  it.each([
    [8000, 6000],
    [6000, 8000],
    [1000000, 10],
    [1, 1000000],
    [3, 2],
  ])("bounds %i × %i without a large image fixture", (width, height) => {
    const size = sourceImageDimensions(
      { width, height },
      MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
    );
    expect(size.width * size.height * 4).toBeLessThanOrEqual(
      MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
    );
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(8192);
    expect(size.width).toBeLessThanOrEqual(width);
    expect(size.height).toBeLessThanOrEqual(height);
    expect(
      Math.abs(size.width - (size.height * width) / height),
    ).toBeLessThanOrEqual(Math.max(1, width / height));
  });

  it("validates dimensions and honors even a one-pixel budget", () => {
    expect(() =>
      sourceImageDimensions({ width: Infinity, height: 1 }),
    ).toThrow();
    expect(sourceImageDimensions({ width: 1000000, height: 1 }, 4)).toEqual({
      width: 1,
      height: 1,
    });
    expect(sourceImageDimensions({ width: 3, height: 2 })).toEqual({
      width: 3,
      height: 2,
    });
  });

  it.each([
    ["iPhone", 5, MOBILE_SOURCE_IMAGE_BYTE_BUDGET],
    ["Macintosh", 5, MOBILE_SOURCE_IMAGE_BYTE_BUDGET],
    ["Macintosh", 0, SOURCE_IMAGE_BYTE_BUDGET],
    ["Windows", 5, SOURCE_IMAGE_BYTE_BUDGET],
  ])(
    "selects a source budget for %s with %i touch points",
    (userAgent, maxTouchPoints, budget) => {
      vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
      expect(getSourceImageByteBudget()).toBe(budget);
    },
  );
});

describe("bounded worker source", () => {
  const makeBitmap = (width: number, height: number) => ({
    width,
    height,
    close: vi.fn(),
  });
  it.each([pngHeaderBlob, jpegHeaderBlob])(
    "does not upscale a tiny source to stale manifest dimensions (%#)",
    async (createBlob) => {
      const decode = vi
        .fn()
        .mockResolvedValueOnce(makeBitmap(2, 1))
        .mockResolvedValueOnce(makeBitmap(2, 1));
      vi.stubGlobal("createImageBitmap", decode);
      const post = vi.fn();
      await createTextureWorkerHandler(post)({
        type: "load-image",
        payload: {
          sessionId: 1,
          url: "/photo",
          blob: createBlob(2, 1),
          imageWidth: 6000,
          imageHeight: 4000,
          maxSourceBytes: SOURCE_IMAGE_BYTE_BUDGET,
          maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
          maxTextureSize: 4096,
        },
      });
      expect(decode.mock.calls[0][1]).not.toHaveProperty("resizeWidth");
      expect(decode.mock.calls[0][1]).not.toHaveProperty("resizeHeight");
      expect(decode.mock.calls[1][1]).toMatchObject({
        resizeWidth: 2,
        resizeHeight: 1,
      });
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "image-loaded",
          payload: expect.objectContaining({
            imageWidth: 6000,
            imageHeight: 4000,
            sourceWidth: 2,
            sourceHeight: 1,
          }),
        }),
        expect.any(Array),
      );
    },
  );

  it("keeps header dimensions as logical coordinates when no manifest hint exists", async () => {
    const target = sourceImageDimensions({ width: 8000, height: 6000 });
    const decode = vi
      .fn()
      .mockResolvedValueOnce(makeBitmap(target.width, target.height))
      .mockResolvedValueOnce(makeBitmap(4000, 3000));
    vi.stubGlobal("createImageBitmap", decode);
    const post = vi.fn();
    await createTextureWorkerHandler(post)({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "/photo",
        blob: pngHeaderBlob(8000, 6000),
        maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
        maxTextureSize: 4096,
      },
    });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image-loaded",
        payload: expect.objectContaining({
          imageWidth: 8000,
          imageHeight: 6000,
        }),
      }),
      expect.any(Array),
    );
  });
  it("requests downsampling before decoding and maps logical tiles to retained pixels", async () => {
    const target = sourceImageDimensions(
      { width: 8000, height: 6000 },
      MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
    );
    const source = makeBitmap(target.width, target.height);
    const base = makeBitmap(target.width, target.height);
    const tile = makeBitmap(100, 100);
    const decode = vi
      .fn()
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(tile);
    vi.stubGlobal("createImageBitmap", decode);
    const post = vi.fn();
    const handle = createTextureWorkerHandler(post);
    await handle({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "/original.jpg",
        blob: pngHeaderBlob(8000, 6000),
        imageWidth: 8000,
        imageHeight: 6000,
        maxSourceBytes: MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
        maxTextureSize: 4096,
        maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
      },
    });
    expect(decode.mock.calls[0][1]).toMatchObject({
      imageOrientation: "from-image",
      resizeWidth: target.width,
      resizeHeight: target.height,
      premultiplyAlpha: "none",
    });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image-loaded",
        payload: expect.objectContaining({
          imageWidth: 8000,
          imageHeight: 6000,
          sourceWidth: target.width,
          sourceHeight: target.height,
        }),
      }),
      [base],
    );
    await handle({
      type: "create-tile",
      payload: {
        sessionId: 1,
        x: 15,
        y: 11,
        lodLevel: 2,
        imageWidth: 8000,
        imageHeight: 6000,
        key: "15-11-2",
      },
    });
    const [, x, y, width, height, options] = decode.mock.calls[2];
    expect(x + width).toBeCloseTo(target.width);
    expect(y + height).toBeCloseTo(target.height);
    expect(options.resizeWidth).toBeLessThanOrEqual(Math.ceil(width));
    expect(options.resizeHeight).toBeLessThanOrEqual(Math.ceil(height));
    expect(source.close).not.toHaveBeenCalled();
  });

  it("keeps oriented portrait dimensions and joins integer crop boundaries exactly", async () => {
    const source = makeBitmap(1251, 1668);
    const decode = vi
      .fn()
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(makeBitmap(1251, 1668))
      .mockImplementation(async () => makeBitmap(100, 100));
    vi.stubGlobal("createImageBitmap", decode);
    const post = vi.fn();
    const handle = createTextureWorkerHandler(post);
    await handle({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "/portrait.jpg",
        blob: pngHeaderBlob(6000, 8000),
        imageWidth: 6000,
        imageHeight: 8000,
        maxSourceBytes: MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
        maxTextureSize: 4096,
        maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
      },
    });
    const target = sourceImageDimensions(
      { width: 6000, height: 8000 },
      MOBILE_SOURCE_IMAGE_BYTE_BUDGET,
    );
    expect(decode.mock.calls[0][1]).toMatchObject({
      imageOrientation: "from-image",
      resizeWidth: target.width,
      resizeHeight: target.height,
    });
    for (const x of [0, 1])
      await handle({
        type: "create-tile",
        payload: {
          sessionId: 1,
          x,
          y: 0,
          lodLevel: 0,
          imageWidth: 6000,
          imageHeight: 8000,
          key: `${x}-0-0`,
        },
      });
    const [, x1, , width1, , options1] = decode.mock.calls[2];
    const [, x2, , width2, , options2] = decode.mock.calls[3];
    expect([x1, x2, width1, width2].every(Number.isInteger)).toBe(true);
    expect(x1 + width1).toBe(x2);
    expect(options1.resizeWidth).toBeLessThanOrEqual(width1);
    expect(options2.resizeWidth).toBeLessThanOrEqual(width2);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image-loaded",
        payload: expect.objectContaining({
          imageWidth: 6000,
          imageHeight: 8000,
        }),
      }),
      expect.any(Array),
    );
  });

  it("closes an oversized discovered bitmap exactly once when resizing fails", async () => {
    const large = makeBitmap(8000, 6000);
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockResolvedValueOnce(large)
        .mockRejectedValueOnce(new Error("resize failed")),
    );
    const post = vi.fn();
    await createTextureWorkerHandler(post)({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "/photo.jpg",
        blob: new Blob(["stub"]),
        maxTextureSize: 4096,
        maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
      },
    });
    expect(large.close).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "load-error",
      sessionId: 1,
      payload: { error: "resize failed" },
    });
  });

  it("rejects resize results that still exceed the retained pixel budget", async () => {
    const large = makeBitmap(8000, 6000);
    const ignoredResize = makeBitmap(8000, 6000);
    const decode = vi
      .fn()
      .mockResolvedValueOnce(large)
      .mockResolvedValueOnce(ignoredResize);
    vi.stubGlobal("createImageBitmap", decode);
    const post = vi.fn();
    await createTextureWorkerHandler(post)({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "/photo.jpg",
        blob: new Blob(["stub"]),
        maxTextureSize: 4096,
        maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
      },
    });
    expect(large.close).toHaveBeenCalledOnce();
    expect(ignoredResize.close).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "load-error",
      sessionId: 1,
      payload: { error: "Decoded image exceeds source pixel budget" },
    });
  });

  it("closes late resized pixels after reload without touching the current source", async () => {
    const large = makeBitmap(8000, 6000);
    const late = makeBitmap(4000, 3000);
    const current = makeBitmap(1000, 750);
    const deferred = Promise.withResolvers<typeof late>();
    const decode = vi
      .fn()
      .mockResolvedValueOnce(large)
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(makeBitmap(500, 375));
    vi.stubGlobal("createImageBitmap", decode);
    const post = vi.fn();
    const handle = createTextureWorkerHandler(post);
    const load = (sessionId: number) =>
      handle({
        type: "load-image",
        payload: {
          sessionId,
          url: "/photo.jpg",
          blob: new Blob(["stub"]),
          maxTextureSize: 4096,
          maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
        },
      });
    const old = load(1);
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2));
    await load(2);
    deferred.resolve(late);
    await old;
    expect(large.close).toHaveBeenCalledOnce();
    expect(late.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(post.mock.calls.every(([message]) => message.sessionId === 2)).toBe(
      true,
    );
  });

  it("reduces unknown-size sources after discovery and releases the oversized bitmap", async () => {
    const large = makeBitmap(8000, 6000);
    const retained = makeBitmap(4000, 3000);
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockResolvedValueOnce(large)
        .mockResolvedValueOnce(retained)
        .mockResolvedValueOnce(makeBitmap(4000, 3000)),
    );
    const post = vi.fn();
    await createTextureWorkerHandler(post)({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "/unknown.jpg",
        blob: new Blob(["stub"]),
        maxTextureSize: 4096,
        maxTextureBytes: SOURCE_IMAGE_BYTE_BUDGET,
      },
    });
    expect(large.close).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image-loaded",
        payload: expect.objectContaining({
          imageWidth: 8000,
          imageHeight: 6000,
          sourceWidth: 4000,
          sourceHeight: 3000,
        }),
      }),
      expect.any(Array),
    );
  });
});
