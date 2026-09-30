// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { readSourceImageDimensions } from "./source-image-header";

function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 2;
  bytes.set(new TextEncoder().encode("IEND"), 37);
  return bytes;
}

function jpeg(
  orientation?: number,
  little = true,
  progressive = false,
): Uint8Array<ArrayBuffer> {
  const sof = [255, progressive ? 194 : 192, 0, 11, 8, 0, 2, 0, 3, 1, 1, 17, 0];
  if (orientation === undefined)
    return Uint8Array.from([255, 216, ...sof, 255, 217]);
  const exif = new Uint8Array(36);
  exif.set([255, 225, 0, 34, 69, 120, 105, 102, 0, 0]);
  const tiff = new DataView(exif.buffer, 10);
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, little);
  tiff.setUint32(4, 8, little);
  tiff.setUint16(8, 1, little);
  tiff.setUint16(10, 0x112, little);
  tiff.setUint16(12, 3, little);
  tiff.setUint32(14, 1, little);
  tiff.setUint16(18, orientation, little);
  // Deliberately put EXIF after SOF: the reader must not return prematurely.
  return Uint8Array.from([255, 216, ...sof, ...exif, 255, 217]);
}

function webp(kind: string, payload: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(20 + payload.length + (payload.length % 2));
  bytes.set(new TextEncoder().encode("RIFF"));
  bytes.set(new TextEncoder().encode(`WEBP${kind}`), 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

describe("bounded source image headers", () => {
  it("reads the source PNG dimensions regardless of MIME type", async () => {
    expect(
      await readSourceImageDimensions(
        new Blob([png(2, 1)], { type: "image/jpeg" }),
      ),
    ).toEqual({ width: 2, height: 1 });
  });

  it.each(["GIF87a", "GIF89a"])(
    "reads the %s logical canvas",
    async (signature) => {
      const bytes = new Uint8Array(13);
      bytes.set(new TextEncoder().encode(signature));
      bytes.set([3, 0, 2, 0], 6);
      expect(await readSourceImageDimensions(new Blob([bytes]))).toEqual({
        width: 3,
        height: 2,
      });
    },
  );

  it.each([
    ["VP8 ", [0, 0, 0, 157, 1, 42, 3, 0, 2, 0]],
    ["VP8L", [47, 2, 64, 0, 0]],
    ["VP8X", [0, 0, 0, 0, 2, 0, 0, 1, 0, 0]],
  ])("reads %s WebP headers", async (kind, payload) => {
    expect(
      await readSourceImageDimensions(new Blob([webp(kind, payload)])),
    ).toEqual({ width: 3, height: 2 });
  });

  it.each([false, true])(
    "reads baseline and progressive JPEG (progressive=%s)",
    async (progressive) => {
      expect(
        await readSourceImageDimensions(
          new Blob([jpeg(undefined, true, progressive)]),
        ),
      ).toEqual({ width: 3, height: 2 });
    },
  );

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "applies JPEG orientation %i for both TIFF byte orders",
    async (orientation) => {
      for (const little of [true, false]) {
        expect(
          await readSourceImageDimensions(
            new Blob([jpeg(orientation, little)]),
          ),
        ).toEqual(
          orientation >= 5 ? { width: 2, height: 3 } : { width: 3, height: 2 },
        );
      }
    },
  );

  it("returns null for truncated headers, invalid sizes and malformed EXIF offsets", async () => {
    const badExif = jpeg(6);
    new DataView(badExif.buffer).setUint32(29, 0xffffffff, true);
    const cases = [
      new Uint8Array(),
      new TextEncoder().encode("unknown"),
      png(0, 2),
      png(2, 0x80000000),
      jpeg(9),
      badExif,
      Uint8Array.from([255, 216, 255, 225, 0, 1]),
    ];
    for (const bytes of [png(3, 2), jpeg(6), webp("VP8L", [47, 2, 64, 0, 0])]) {
      cases.push(bytes.slice(0, -1));
    }
    for (const bytes of cases)
      expect(await readSourceImageDimensions(new Blob([bytes]))).toBeNull();
  });

  it("stops at the JPEG scan and does not parse entropy-coded bytes as metadata", async () => {
    const header = jpeg(6).slice(0, -2);
    const scan = Uint8Array.from([
      255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42, 255, 0,
    ]);
    expect(await readSourceImageDimensions(new Blob([header, scan]))).toEqual({
      width: 2,
      height: 3,
    });
    expect(
      await readSourceImageDimensions(new Blob([header, scan.slice(0, 9)])),
    ).toBeNull();
  });

  it("declines WebP with EXIF and PNG with eXIf before or after IDAT", async () => {
    expect(
      await readSourceImageDimensions(
        new Blob([webp("VP8X", [8, 0, 0, 0, 2, 0, 0, 1, 0, 0])]),
      ),
    ).toBeNull();
    const chunk = (kind: string) => {
      const bytes = new Uint8Array(12);
      bytes.set(new TextEncoder().encode(kind), 4);
      return bytes;
    };
    for (const chunks of [
      [chunk("eXIf"), chunk("IDAT")],
      [chunk("IDAT"), chunk("eXIf")],
    ]) {
      expect(
        await readSourceImageDimensions(
          new Blob([png(3, 2).slice(0, 33), ...chunks, chunk("IEND")]),
        ),
      ).toBeNull();
    }
    // An unseen tail might contain eXIf, so a large IDAT cannot establish orientation.
    const idat = new Uint8Array(300 * 1024);
    new DataView(idat.buffer).setUint32(0, idat.length - 12);
    idat.set(new TextEncoder().encode("IDAT"), 4);
    expect(
      await readSourceImageDimensions(
        new Blob([png(3, 2).slice(0, 33), idat, chunk("IEND")]),
      ),
    ).toBeNull();
  });

  it("never reads beyond the 256 KiB prefix and handles read failures", async () => {
    const blob = new Blob([png(3, 2), new Uint8Array(300 * 1024)]);
    const slice = vi.spyOn(blob, "slice");
    const wholeRead = vi.spyOn(blob, "arrayBuffer");
    expect(await readSourceImageDimensions(blob)).toEqual({
      width: 3,
      height: 2,
    });
    expect(slice).toHaveBeenCalledExactlyOnceWith(0, 256 * 1024);
    expect(wholeRead).not.toHaveBeenCalled();
    slice.mockImplementation(() => {
      throw new Error("unreadable");
    });
    expect(await readSourceImageDimensions(blob)).toBeNull();
  });

  it("declines JPEGs whose pre-scan metadata exceeds the read limit", async () => {
    const segment = new Uint8Array(65537);
    segment.set([255, 225, 255, 255]);
    expect(
      await readSourceImageDimensions(
        new Blob([
          Uint8Array.from([255, 216]),
          segment,
          segment,
          segment,
          segment,
          jpeg().slice(2),
        ]),
      ),
    ).toBeNull();
  });
});
