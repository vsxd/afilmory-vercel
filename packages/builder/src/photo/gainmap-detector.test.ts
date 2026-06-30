import { describe, expect, it } from "vitest";

import { detectGainMap } from "./gainmap-detector.js";

describe("detectGainMap", () => {
  it("returns true when ContainerDirectory holds a GainMap item with a Length", () => {
    const exifData = {
      ContainerDirectory: [
        { Item: { Semantic: "Primary", Length: 1000 } },
        { Item: { Semantic: "GainMap", Length: 4096 } },
      ],
    };
    expect(detectGainMap({ exifData })).toBe(true);
  });

  it("returns false when there is no ContainerDirectory", () => {
    expect(detectGainMap({ exifData: {} })).toBe(false);
    expect(detectGainMap({ exifData: null })).toBe(false);
    expect(detectGainMap({})).toBe(false);
  });

  it("returns false when ContainerDirectory is not an array", () => {
    expect(
      detectGainMap({
        exifData: { ContainerDirectory: "not-an-array" as never },
      }),
    ).toBe(false);
  });

  it("returns false when no item carries the GainMap semantic", () => {
    const exifData = {
      ContainerDirectory: [
        { Item: { Semantic: "Primary", Length: 1000 } },
        { Item: { Semantic: "MotionPhoto", Length: 4096 } },
      ],
    };
    expect(detectGainMap({ exifData })).toBe(false);
  });

  it("ignores a GainMap entry that has no Length", () => {
    const exifData = {
      ContainerDirectory: [{ Item: { Semantic: "GainMap" } }],
    };
    expect(detectGainMap({ exifData })).toBe(false);
  });

  it("skips directory entries without an Item", () => {
    const exifData = {
      ContainerDirectory: [{}, { Item: { Semantic: "GainMap", Length: 2048 } }],
    };
    expect(detectGainMap({ exifData })).toBe(true);
  });
});
