import { describe, expect, it } from "vitest";

import { compressUint8Array, decompressUint8Array } from "../index";

describe("u8array helpers", () => {
  it("roundtrips bytes through hex", () => {
    const original = Uint8Array.from([0, 1, 15, 16, 255]);

    expect(decompressUint8Array(compressUint8Array(original))).toEqual(
      original,
    );
  });

  it("pads single-nibble bytes", () => {
    expect(compressUint8Array(Uint8Array.from([0, 15, 255]))).toBe("000fff");
  });
});
