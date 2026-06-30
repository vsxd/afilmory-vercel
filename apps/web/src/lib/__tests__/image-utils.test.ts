import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  getImageFormat,
  getImageFormatDisplayName,
  isSupportedImageFormat,
} from "../image-utils";

describe("getImageFormat", () => {
  it("returns UNKNOWN for empty or falsy input", () => {
    expect(getImageFormat("")).toBe("UNKNOWN");
  });

  it("extracts and uppercases the file extension", () => {
    expect(getImageFormat("photo.jpg")).toBe("JPG");
    expect(getImageFormat("image.HEIC")).toBe("HEIC");
    expect(getImageFormat("/path/to/picture.png")).toBe("PNG");
  });

  it("strips query strings and hash fragments before reading the extension", () => {
    expect(getImageFormat("https://cdn.example.com/a/photo.heic?v=2")).toBe(
      "HEIC",
    );
    expect(getImageFormat("photo.webp#preview")).toBe("WEBP");
    expect(getImageFormat("photo.avif?token=abc#frag")).toBe("AVIF");
  });

  it("returns UNKNOWN when the path ends with a trailing dot (empty extension)", () => {
    // "image.".split(".").pop() === "" which is falsy -> UNKNOWN.
    expect(getImageFormat("image.")).toBe("UNKNOWN");
  });

  it("falls back to the last dotted segment when there is no real extension", () => {
    // No filename extension: split(".") picks up the domain segment.
    // This documents the function's naive behavior rather than endorsing it.
    expect(getImageFormat("https://example.com/image")).toBe("COM/IMAGE");
  });
});

describe("formatFileSize", () => {
  it("returns 0B for zero bytes", () => {
    expect(formatFileSize(0)).toBe("0B");
  });

  it("formats bytes across unit boundaries", () => {
    expect(formatFileSize(512)).toBe("512B");
    expect(formatFileSize(1024)).toBe("1KB");
    expect(formatFileSize(1024 * 1024)).toBe("1MB");
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1GB");
    expect(formatFileSize(1024 ** 4)).toBe("1TB");
  });

  it("uses one decimal place by default and trims trailing zeros", () => {
    expect(formatFileSize(1536)).toBe("1.5KB");
    expect(formatFileSize(2048)).toBe("2KB"); // 2.0 -> "2"
    expect(formatFileSize(22_120_103)).toBe("21.1MB");
  });

  it("respects a custom decimals argument", () => {
    expect(formatFileSize(1536, 2)).toBe("1.5KB");
    expect(formatFileSize(1_500_000, 3)).toBe("1.431MB");
  });

  it("rounds when decimals is 0", () => {
    // 1536 bytes = 1.5KB, rounded to 0 decimals -> 2KB.
    expect(formatFileSize(1536, 0)).toBe("2KB");
  });

  it("clamps negative decimals to 0", () => {
    expect(formatFileSize(1536, -2)).toBe("2KB");
  });
});

describe("isSupportedImageFormat", () => {
  it("accepts every supported format, case-insensitively", () => {
    for (const fmt of [
      "JPG",
      "jpeg",
      "Png",
      "webp",
      "gif",
      "bmp",
      "svg",
      "heic",
      "heif",
      "hif",
      "avif",
      "tiff",
      "tif",
    ]) {
      expect(isSupportedImageFormat(fmt)).toBe(true);
    }
  });

  it("rejects unsupported or empty formats", () => {
    expect(isSupportedImageFormat("mp4")).toBe(false);
    expect(isSupportedImageFormat("pdf")).toBe(false);
    expect(isSupportedImageFormat("")).toBe(false);
  });
});

describe("getImageFormatDisplayName", () => {
  it("maps known formats to canonical display names", () => {
    expect(getImageFormatDisplayName("JPG")).toBe("JPEG");
    expect(getImageFormatDisplayName("JPEG")).toBe("JPEG");
    expect(getImageFormatDisplayName("HIF")).toBe("HEIF");
    expect(getImageFormatDisplayName("HEIF")).toBe("HEIF");
    expect(getImageFormatDisplayName("HEIC")).toBe("HEIC");
    expect(getImageFormatDisplayName("WEBP")).toBe("WebP");
    expect(getImageFormatDisplayName("TIF")).toBe("TIFF");
    expect(getImageFormatDisplayName("TIFF")).toBe("TIFF");
  });

  it("is case-insensitive on input", () => {
    expect(getImageFormatDisplayName("jpg")).toBe("JPEG");
    expect(getImageFormatDisplayName("webp")).toBe("WebP");
  });

  it("falls back to the uppercased input for unknown formats", () => {
    expect(getImageFormatDisplayName("raw")).toBe("RAW");
    expect(getImageFormatDisplayName("xyz")).toBe("XYZ");
  });
});
