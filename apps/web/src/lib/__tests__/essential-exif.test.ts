import type { PickedExif } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { getEssentialExif } from "../essential-exif";

describe("getEssentialExif", () => {
  it("returns all-null fields when exif is missing", () => {
    const empty = {
      focalLength35mm: null,
      focalLength: null,
      iso: null,
      shutterSpeed: null,
      aperture: null,
    };
    expect(getEssentialExif(null)).toEqual(empty);
    expect(getEssentialExif(undefined)).toEqual(empty);
  });

  it("pins the exact formatting for a fully populated exif", () => {
    const exif: PickedExif = {
      FocalLengthIn35mmFormat: "35 mm",
      FocalLength: "23.0 mm",
      ISO: 200,
      ExposureTime: "1/250",
      FNumber: 1.8,
    };

    expect(getEssentialExif(exif)).toEqual({
      focalLength35mm: 35,
      focalLength: 23,
      iso: 200,
      shutterSpeed: "1/250s",
      aperture: "f/1.8",
    });
  });

  it("keeps focalLength35mm null when only the actual focal length exists", () => {
    // 查看器把「实际焦距」与「等效焦距」分开展示，这里不能做回退；
    // 画廊覆盖层的回退在调用侧组合（focalLength35mm ?? focalLength）。
    const exif: PickedExif = { FocalLength: "56 mm" };

    const result = getEssentialExif(exif);
    expect(result.focalLength35mm).toBeNull();
    expect(result.focalLength).toBe(56);
    expect(result.focalLength35mm ?? result.focalLength).toBe(56);
  });

  it("formats fractional and numeric shutter speeds verbatim", () => {
    expect(getEssentialExif({ ExposureTime: "1/8000" }).shutterSpeed).toBe(
      "1/8000s",
    );
    expect(getEssentialExif({ ExposureTime: 0.005 }).shutterSpeed).toBe(
      "0.005s",
    );
    expect(getEssentialExif({ ExposureTime: 30 }).shutterSpeed).toBe("30s");
  });

  it("falls back to ShutterSpeedValue when ExposureTime is missing", () => {
    expect(getEssentialExif({ ShutterSpeedValue: "1/97" }).shutterSpeed).toBe(
      "1/97s",
    );
    expect(
      getEssentialExif({ ExposureTime: "1/250", ShutterSpeedValue: "1/256" })
        .shutterSpeed,
    ).toBe("1/250s");
  });

  it("formats aperture as f/<FNumber> and leaves missing fields null", () => {
    expect(getEssentialExif({ FNumber: 8 }).aperture).toBe("f/8");
    expect(getEssentialExif({ FNumber: 5.6 }).aperture).toBe("f/5.6");

    const sparse = getEssentialExif({ ISO: 6400 });
    expect(sparse).toEqual({
      focalLength35mm: null,
      focalLength: null,
      iso: 6400,
      shutterSpeed: null,
      aperture: null,
    });
  });
});
