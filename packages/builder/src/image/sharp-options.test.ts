import { describe, expect, it } from "vitest";

import { SOURCE_SHARP_OPTIONS } from "./sharp-options.js";

describe("SOURCE_SHARP_OPTIONS", () => {
  it("decodes as much as possible by disabling failOn", () => {
    // sharp defaults to failOn: "warning" which drops recoverable truncated
    // JPEGs; "none" keeps them in the manifest.
    expect(SOURCE_SHARP_OPTIONS.failOn).toBe("none");
  });

  it("raises the input pixel cap to 1 gigapixel for large panoramas", () => {
    expect(SOURCE_SHARP_OPTIONS.limitInputPixels).toBe(1_000_000_000);
  });

  it("keeps the pixel cap above sharp's ~268MP default but bounded", () => {
    // Above the default (~268,402,689) so panoramas decode...
    expect(SOURCE_SHARP_OPTIONS.limitInputPixels).toBeGreaterThan(268_402_689);
    // ...but still finite/bounded so pathological inputs cannot OOM.
    expect(Number.isFinite(SOURCE_SHARP_OPTIONS.limitInputPixels)).toBe(true);
  });

  it("only exposes the two intended decode options", () => {
    expect(Object.keys(SOURCE_SHARP_OPTIONS).sort()).toEqual([
      "failOn",
      "limitInputPixels",
    ]);
  });
});
