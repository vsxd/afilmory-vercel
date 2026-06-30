import type { CompressedHistogramData } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { decompressHistogram } from "../histogram";

const constant = (value: number): number[] =>
  Array.from({ length: 64 }, () => value);

const makeCompressed = (
  overrides: Partial<CompressedHistogramData> = {},
): CompressedHistogramData => ({
  red: constant(0),
  green: constant(0),
  blue: constant(0),
  luminance: constant(0),
  ...overrides,
});

describe("decompressHistogram", () => {
  it("expands every channel to 256 points", () => {
    const result = decompressHistogram(makeCompressed());
    expect(result.red).toHaveLength(256);
    expect(result.green).toHaveLength(256);
    expect(result.blue).toHaveLength(256);
    expect(result.luminance).toHaveLength(256);
  });

  it("returns all zeros for an all-zero input", () => {
    const result = decompressHistogram(makeCompressed());
    expect(result.red.every((v) => v === 0)).toBe(true);
    expect(result.luminance.every((v) => v === 0)).toBe(true);
  });

  it("restores the /10000 fixed-point scaling to floats", () => {
    // every compressed bucket = 5000 -> 0.5 after both interpolation endpoints match
    const result = decompressHistogram(makeCompressed({ red: constant(5000) }));
    expect(result.red.every((v) => Math.abs(v - 0.5) < 1e-9)).toBe(true);
  });

  it("linearly interpolates between adjacent compressed buckets", () => {
    // bucket 0 = 0.0, bucket 1 = 1.0 -> first 4 output points ramp 0 -> 0.75
    const data = constant(0);
    data[1] = 10000; // 1.0 after scaling
    const result = decompressHistogram(makeCompressed({ green: data }));

    expect(result.green[0]).toBeCloseTo(0, 9);
    expect(result.green[1]).toBeCloseTo(0.25, 9);
    expect(result.green[2]).toBeCloseTo(0.5, 9);
    expect(result.green[3]).toBeCloseTo(0.75, 9);
    expect(result.green[4]).toBeCloseTo(1, 9); // start of bucket 1
  });

  it("clamps the final bucket so the last points do not read out of range", () => {
    const data = constant(0);
    data[63] = 10000;
    const result = decompressHistogram(makeCompressed({ blue: data }));
    // indices 252..255 map to compressedIndex 63 with next clamped to 63 -> flat 1.0
    expect(result.blue[255]).toBeCloseTo(1, 9);
    expect(result.blue.at(-1)).toBeCloseTo(1, 9);
  });

  it("treats missing compressed entries as 0", () => {
    const result = decompressHistogram(makeCompressed({ red: [] }));
    expect(result.red.every((v) => v === 0)).toBe(true);
  });
});
