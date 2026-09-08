import { describe, expect, it } from "vitest";

import { isSupportedImageKey } from "./supported-formats.js";

describe("isSupportedImageKey", () => {
  it("accepts supported image extensions case-insensitively", () => {
    expect(isSupportedImageKey("a.jpg")).toBe(true);
    expect(isSupportedImageKey("dir/b.HEIC")).toBe(true);
    expect(isSupportedImageKey("c.TIFF")).toBe(true);
  });

  it("rejects unsupported, missing, or extension-less keys", () => {
    expect(isSupportedImageKey("clip.mov")).toBe(false);
    expect(isSupportedImageKey("notes.txt")).toBe(false);
    expect(isSupportedImageKey("no-extension")).toBe(false);
    expect(isSupportedImageKey("")).toBe(false);
    // S3 ListObjectsV2 的 Contents[].Key 类型上可为 undefined，谓词必须兜住
    expect(isSupportedImageKey(undefined)).toBe(false);
  });

  it("honors a caller-provided supported format set", () => {
    const formats = new Set([".avif"]);
    expect(isSupportedImageKey("custom.avif", formats)).toBe(true);
    expect(isSupportedImageKey("default.jpg", formats)).toBe(false);
  });
});
