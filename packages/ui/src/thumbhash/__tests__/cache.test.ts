import { describe, expect, it } from "vitest";

import { getThumbhashDataUrl, resetThumbhashCache } from "../cache";

describe("getThumbhashDataUrl", () => {
  it("returns a fallback data URL instead of throwing on a malformed hash string", () => {
    resetThumbhashCache();
    expect(() => getThumbhashDataUrl("not-a-valid-thumbhash!!")).not.toThrow();
    const result = getThumbhashDataUrl("not-a-valid-thumbhash!!");
    expect(result.startsWith("data:image/")).toBe(true);
  });

  it("returns a fallback instead of throwing on malformed raw bytes", () => {
    expect(() => getThumbhashDataUrl(new Uint8Array([1, 2]))).not.toThrow();
    expect(getThumbhashDataUrl(new Uint8Array([1, 2]))).toMatch(
      /^data:image\//,
    );
  });
});
