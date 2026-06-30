import { describe, expect, it } from "vitest";

import {
  clampAccentContrast,
  contrastRatio,
  hexToRgb,
  luminance,
  mix,
  rgbToHex,
} from "../color";

describe("hexToRgb", () => {
  it("parses 6-digit hex with or without a leading #", () => {
    expect(hexToRgb("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
    expect(hexToRgb("00ff80")).toEqual({ r: 0, g: 255, b: 128 });
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#AbCdEf")).toEqual({ r: 0xab, g: 0xcd, b: 0xef });
  });

  it("returns null for malformed input", () => {
    expect(hexToRgb("#fff")).toBeNull(); // 3-digit shorthand is not supported
    expect(hexToRgb("not-a-color")).toBeNull();
    expect(hexToRgb("#ff88")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("formats and zero-pads each channel", () => {
    expect(rgbToHex({ r: 0, g: 16, b: 255 })).toBe("#0010ff");
  });

  it("rounds and clamps out-of-range channels into [0, 255]", () => {
    expect(rgbToHex({ r: -10, g: 127.6, b: 300 })).toBe("#0080ff");
  });

  it("round-trips with hexToRgb", () => {
    const hex = "#3a7bd5";
    expect(rgbToHex(hexToRgb(hex)!)).toBe(hex);
  });
});

describe("luminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it("weights green above red above blue", () => {
    const green = luminance({ r: 0, g: 255, b: 0 });
    const red = luminance({ r: 255, g: 0, b: 0 });
    const blue = luminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 between black and white", () => {
    expect(
      contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }),
    ).toBeCloseTo(21, 5);
  });

  it("is symmetric and equals 1 for identical colors", () => {
    const a = { r: 10, g: 20, b: 30 };
    const b = { r: 200, g: 100, b: 50 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
    expect(contrastRatio(a, a)).toBeCloseTo(1, 10);
  });
});

describe("mix", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 100, g: 200, b: 50 };
    expect(mix(a, b, 0)).toEqual(a);
    expect(mix(a, b, 1)).toEqual(b);
  });

  it("returns the midpoint at t=0.5", () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0.5)).toEqual({
      r: 50,
      g: 100,
      b: 25,
    });
  });
});

describe("clampAccentContrast", () => {
  const bg = "#1c1c1e";
  const bgRgb = hexToRgb(bg)!;

  it("returns an in-band accent unchanged", () => {
    // Find a real gray whose contrast against bg already sits inside [2.2, 4.5].
    let accent: { r: number; g: number; b: number } | null = null;
    for (let v = 0; v <= 255; v++) {
      const candidate = { r: v, g: v, b: v };
      const cr = contrastRatio(candidate, bgRgb);
      if (cr >= 2.2 && cr <= 4.5) {
        accent = candidate;
        break;
      }
    }
    expect(accent).not.toBeNull();
    expect(clampAccentContrast(accent!, bg)).toEqual(accent);
  });

  it("darkens a too-bright accent until contrast drops to <= max", () => {
    const out = clampAccentContrast({ r: 255, g: 255, b: 255 }, bg);
    expect(contrastRatio(out, bgRgb)).toBeLessThanOrEqual(4.5 + 1e-9);
  });

  it("brightens a too-dim accent until contrast rises to >= min", () => {
    const nearBg = hexToRgb("#202022")!;
    const out = clampAccentContrast(nearBg, bg);
    expect(contrastRatio(out, bgRgb)).toBeGreaterThanOrEqual(2.2 - 1e-9);
  });

  it("respects a custom contrast band", () => {
    const out = clampAccentContrast({ r: 255, g: 255, b: 255 }, bg, {
      min: 1,
      max: 2,
    });
    expect(contrastRatio(out, bgRgb)).toBeLessThanOrEqual(2 + 1e-9);
  });

  it("falls back to the default bg (#1c1c1e) when bgHex is unparseable", () => {
    const white = { r: 255, g: 255, b: 255 };
    expect(clampAccentContrast(white, "garbage")).toEqual(
      clampAccentContrast(white, "#1c1c1e"),
    );
  });
});
