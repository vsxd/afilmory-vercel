// @vitest-environment node
import sharp from "sharp";
import { decode } from "tiff";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TiffConverterStrategy } from "../strategies/tiff";
import { tiffPixelsToRgba } from "../strategies/tiff-pixels";

afterEach(() => vi.unstubAllGlobals());

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
