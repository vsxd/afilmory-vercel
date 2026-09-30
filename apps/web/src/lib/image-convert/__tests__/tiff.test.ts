// @vitest-environment node
import sharp from "sharp";
import { decode } from "tiff";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TiffConverterStrategy } from "../strategies/tiff";
import { decodeFirstTiffPage, inspectTiff } from "../strategies/tiff-decode";
import {
  DESKTOP_TIFF_BUDGET,
  MOBILE_TIFF_BUDGET,
} from "../strategies/tiff-limits";
import { tiffPixelsToRgba } from "../strategies/tiff-pixels";

vi.mock("tiff", async (importOriginal) => {
  const original = await importOriginal<typeof import("tiff")>();
  return { ...original, decode: vi.fn(original.decode) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Two real uncompressed one-pixel TIFF pages. Only IFD dimensions grow in budget tests. */
function tinyTiff(firstWidth = 1, firstHeight = 1) {
  const ifdBytes = 2 + 9 * 12 + 4;
  const pixelOffset = 8 + ifdBytes * 2;
  const bytes = new ArrayBuffer(pixelOffset + 2);
  const view = new DataView(bytes);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  for (let page = 0; page < 2; page++) {
    const start = 8 + ifdBytes * page;
    view.setUint16(start, 9, true);
    const entries = [
      [256, 4, page === 0 ? firstWidth : 1],
      [257, 4, page === 0 ? firstHeight : 1],
      [258, 3, 8],
      [259, 3, 1],
      [262, 3, 1],
      [273, 4, pixelOffset + page],
      [277, 3, 1],
      [278, 4, 1],
      [279, 4, 1],
    ];
    for (const [index, [tag, type, value]] of entries.entries()) {
      const offset = start + 2 + index * 12;
      view.setUint16(offset, tag, true);
      view.setUint16(offset + 2, type, true);
      view.setUint32(offset + 4, 1, true);
      if (type === 3) view.setUint16(offset + 8, value, true);
      else view.setUint32(offset + 8, value, true);
    }
    view.setUint32(
      start + ifdBytes - 4,
      page === 0 ? start + ifdBytes : 0,
      true,
    );
    view.setUint8(pixelOffset + page, page === 0 ? 127 : 255);
  }
  return bytes;
}

describe("TIFF admission and page selection", () => {
  it("rejects huge header dimensions before pixel decoding, canvas or worker allocation", async () => {
    const worker = vi.fn();
    const canvas = vi.fn();
    vi.stubGlobal("Worker", worker);
    vi.stubGlobal("OffscreenCanvas", canvas);
    await expect(
      new TiffConverterStrategy().convert(new Blob([tinyTiff(50000, 50000)])),
    ).rejects.toMatchObject({ code: "resource-limit" });
    expect(decode).toHaveBeenCalledExactlyOnceWith(expect.any(ArrayBuffer), {
      pages: [0],
      ignoreImageData: true,
    });
    expect(worker).not.toHaveBeenCalled();
    expect(canvas).not.toHaveBeenCalled();
  });

  it("budgets decoded copies separately from the compressed input size", () => {
    const bytes = tinyTiff(4000, 4000);
    expect(() => inspectTiff(bytes, MOBILE_TIFF_BUDGET)).toThrow(
      expect.objectContaining({ code: "resource-limit" }),
    );
    expect(inspectTiff(bytes, DESKTOP_TIFF_BUDGET).width).toBe(4000);
    expect(
      vi
        .mocked(decode)
        .mock.calls.every(([, options]) => options?.ignoreImageData),
    ).toBe(true);
  });

  it("decodes only page zero from a genuine two-page TIFF", () => {
    const bytes = tinyTiff();
    expect(decode(bytes)).toHaveLength(2);
    vi.mocked(decode).mockClear();
    const frame = decodeFirstTiffPage(bytes, DESKTOP_TIFF_BUDGET);
    expect([...frame.data]).toEqual([127]);
    expect(vi.mocked(decode).mock.calls.map(([, options]) => options)).toEqual([
      { pages: [0], ignoreImageData: true },
      { pages: [0] },
    ]);
  });

  it("budgets complete padded tile scratch before decoding even a one-pixel image", async () => {
    const file = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "red" },
    })
      .tiff({
        compression: "deflate",
        tile: true,
        tileWidth: 256,
        tileHeight: 256,
      })
      .toBuffer();
    expect(file.byteLength).toBeLessThan(1024);
    const bytes = new Uint8Array(file).buffer;
    expect(() =>
      decodeFirstTiffPage(bytes, { maxBytes: 4096, maxDimension: 16384 }),
    ).toThrow(expect.objectContaining({ code: "resource-limit" }));
    expect(decode).toHaveBeenCalledExactlyOnceWith(bytes, {
      pages: [0],
      ignoreImageData: true,
    });
    const header = inspectTiff(bytes, {
      maxBytes: 1024 * 1024,
      maxDimension: 16384,
    });
    expect([
      header.width,
      header.height,
      header.tileWidth,
      header.tileHeight,
    ]).toEqual([1, 1, 256, 256]);
    const view = new DataView(bytes);
    const little = view.getUint16(0) === 0x4949;
    const ifd = view.getUint32(4, little);
    for (let index = 0; index < view.getUint16(ifd, little); index++) {
      const entry = ifd + 2 + index * 12;
      if (view.getUint16(entry, little) !== 322) continue;
      for (const edge of [0, 16385]) {
        if (view.getUint16(entry + 2, little) === 3)
          view.setUint16(entry + 8, edge, little);
        else view.setUint32(entry + 8, edge, little);
        expect(() => inspectTiff(bytes, DESKTOP_TIFF_BUDGET)).toThrow(
          expect.objectContaining({ code: "resource-limit" }),
        );
      }
    }
  });

  it("budgets declared strip scratch and retains the whole-image default sentinel", () => {
    const bytes = tinyTiff();
    const view = new DataView(bytes);
    const rowsPerStrip = 8 + 2 + 7 * 12 + 8;
    for (const rows of [0, 4096, 16385]) {
      view.setUint32(rowsPerStrip, rows, true);
      expect(() =>
        inspectTiff(bytes, { maxBytes: 4096, maxDimension: 16384 }),
      ).toThrow(expect.objectContaining({ code: "resource-limit" }));
    }
    view.setUint32(rowsPerStrip, 0xffffffff, true);
    expect(
      inspectTiff(bytes, { maxBytes: 4096, maxDimension: 16384 }).width,
    ).toBe(1);
    // Unknown tag removes RowsPerStrip without changing the tiny file's data.
    view.setUint16(rowsPerStrip - 8, 65000, true);
    expect(
      inspectTiff(bytes, { maxBytes: 4096, maxDimension: 16384 }).height,
    ).toBe(1);
  });

  it("declines multichannel tiled conversion before the codec can lose blue pixels", async () => {
    const file = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "blue" },
    })
      .tiff({
        compression: "deflate",
        tile: true,
        tileWidth: 256,
        tileHeight: 256,
      })
      .toBuffer();
    expect(file.byteLength).toBeLessThan(1024);
    const bytes = new Uint8Array(file).buffer;
    expect(() => decodeFirstTiffPage(bytes, DESKTOP_TIFF_BUDGET)).toThrow(
      "Multichannel tiled TIFF conversion is unsupported",
    );
    expect(decode).toHaveBeenCalledExactlyOnceWith(bytes, {
      pages: [0],
      ignoreImageData: true,
    });
  });

  it("checks unsupported component depth before asking the codec for pixel arrays", () => {
    const bytes = tinyTiff();
    new DataView(bytes).setUint16(8 + 2 + 2 * 12 + 8, 24, true);
    expect(() => decodeFirstTiffPage(bytes, DESKTOP_TIFF_BUDGET)).toThrow(
      "sample format",
    );
    expect(decode).toHaveBeenCalledExactlyOnceWith(bytes, {
      pages: [0],
      ignoreImageData: true,
    });
  });

  it("rejects the encoded input before materializing another buffer", async () => {
    const blob = new Blob([tinyTiff()]);
    Object.defineProperty(blob, "size", {
      value: DESKTOP_TIFF_BUDGET.maxBytes,
    });
    const read = vi.spyOn(blob, "arrayBuffer");
    await expect(
      new TiffConverterStrategy().convert(blob),
    ).rejects.toMatchObject({ code: "resource-limit" });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("TIFF pixel interpretation", () => {
  it("replicates each real decoded grayscale sample across RGB", async () => {
    const bytes = await sharp(Buffer.from([0, 127, 255]), {
      raw: { width: 3, height: 1, channels: 1 },
    })
      .toColourspace("b-w")
      .tiff({ compression: "none" })
      .toBuffer();
    const frame = decode(bytes)[0];
    expect(frame.components).toBe(1);
    const rgba = new Uint8ClampedArray(12);
    tiffPixelsToRgba(frame, rgba);
    expect([...rgba]).toEqual([
      0, 0, 0, 255, 127, 127, 127, 255, 255, 255, 255, 255,
    ]);
  });

  it("preserves zero alpha through real TIFF decoding and selects an alpha-capable encoder", async () => {
    const bytes = await sharp(Buffer.from([255, 0, 0, 0, 0, 255, 0, 255]), {
      raw: { width: 2, height: 1, channels: 4 },
    })
      .tiff({ compression: "none" })
      .toBuffer();
    const pixels = new Uint8ClampedArray(8);
    const putImageData = vi.fn();
    const toBlob = vi.fn((done: BlobCallback, format: string) =>
      done(new Blob(["encoded"], { type: format })),
    );
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({
          createImageData: () => ({ data: pixels }),
          putImageData,
        }),
        toBlob,
      }),
    });
    const result = await new TiffConverterStrategy().convert(
      new Blob([new Uint8Array(bytes)]),
    );
    expect([...pixels]).toEqual([255, 0, 0, 0, 0, 255, 0, 255]);
    expect(result.format).toBe("image/png");
    expect(result.blob.type).toBe("image/png");
    expect(putImageData).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", 0.9);
  });

  it.each([
    { bitsPerSample: 1, sampleFormat: 1, data: new Uint8Array([1, 0]) },
    { bitsPerSample: 8, sampleFormat: 1, data: new Uint8Array([255, 0]) },
    { bitsPerSample: 16, sampleFormat: 1, data: new Uint16Array([65535, 0]) },
    { bitsPerSample: 32, sampleFormat: 3, data: new Float32Array([1, 0]) },
    { bitsPerSample: 64, sampleFormat: 3, data: new Float64Array([1, 0]) },
  ])(
    "scales $bitsPerSample-bit gray-alpha samples without replacing alpha zero",
    (samples) => {
      const rgba = new Uint8ClampedArray(4);
      tiffPixelsToRgba(
        {
          ...samples,
          width: 1,
          height: 1,
          type: 1,
          components: 2,
          alpha: true,
          planarConfiguration: 1,
        },
        rgba,
      );
      expect([...rgba]).toEqual([255, 255, 255, 0]);
    },
  );

  it("rejects unsupported layouts and truncated buffers instead of inventing pixels", () => {
    const frame = {
      width: 1,
      height: 1,
      type: 2,
      components: 3,
      alpha: false,
      planarConfiguration: 1,
      bitsPerSample: 8,
      sampleFormat: 1,
      data: new Uint8Array([255, 0, 0]),
    };
    const rgba = new Uint8ClampedArray(4);
    expect(() => tiffPixelsToRgba({ ...frame, type: 3 }, rgba)).toThrow(
      "layout",
    );
    expect(() =>
      tiffPixelsToRgba({ ...frame, planarConfiguration: 2 }, rgba),
    ).toThrow("layout");
    expect(() => tiffPixelsToRgba({ ...frame, sampleFormat: 2 }, rgba)).toThrow(
      "sample format",
    );
    expect(() =>
      tiffPixelsToRgba({ ...frame, data: new Uint8Array(2) }, rgba),
    ).toThrow("buffer length");
  });
});
