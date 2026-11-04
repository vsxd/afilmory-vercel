import { describe, expect, it, vi } from "vitest";

import { ImagePreviewCache } from "./image-preview-cache";

function preview(width = 10, height = 10) {
  return {
    imageBitmap: { width, height, close: vi.fn() } satisfies ImageBitmap,
    imageWidth: width * 2,
    imageHeight: height * 2,
    lodLevel: 1,
  };
}

describe("ImagePreviewCache", () => {
  it("reuses only the same Blob identity, with LRU eviction under a byte budget", () => {
    const cache = new ImagePreviewCache(800);
    const a = new Blob(["a"]);
    const b = new Blob(["b"]);
    const c = new Blob(["c"]);
    const first = preview();
    const second = preview();
    const third = preview();
    expect(cache.set(a, first)).toBe(true);
    cache.set(b, second);
    expect(cache.get(a)).toBe(first);
    expect(cache.get(new Blob(["a"]))).toBeUndefined();
    cache.set(c, third);
    expect(cache.get(b)).toBeUndefined();
    expect(second.imageBitmap.close).toHaveBeenCalledOnce();
    expect(first.imageBitmap.close).not.toHaveBeenCalled();
    expect(cache.byteSize).toBe(800);
    cache.dispose();
    expect(first.imageBitmap.close).toHaveBeenCalledOnce();
    expect(third.imageBitmap.close).toHaveBeenCalledOnce();
    expect(cache.byteSize).toBe(0);
  });

  it("bounds small entries by count and releases replaced bitmaps exactly once", () => {
    const cache = new ImagePreviewCache(4000, 1);
    const source = new Blob();
    const first = preview();
    const replacement = preview();
    cache.set(source, first);
    cache.set(source, first);
    expect(first.imageBitmap.close).not.toHaveBeenCalled();
    cache.set(source, replacement);
    expect(first.imageBitmap.close).toHaveBeenCalledOnce();
    cache.set(new Blob(), preview());
    expect(replacement.imageBitmap.close).toHaveBeenCalledOnce();
    expect(cache.byteSize).toBe(400);
    cache.dispose();
    cache.dispose();
    expect(replacement.imageBitmap.close).toHaveBeenCalledOnce();
  });

  it("leaves rejected or late bitmaps with the caller", () => {
    const cache = new ImagePreviewCache(400);
    const oversized = preview(20);
    expect(cache.set(new Blob(), oversized)).toBe(false);
    expect(oversized.imageBitmap.close).not.toHaveBeenCalled();
    cache.dispose();
    const late = preview();
    expect(cache.set(new Blob(), late)).toBe(false);
    expect(late.imageBitmap.close).not.toHaveBeenCalled();
    expect(cache.byteSize).toBe(0);
  });
});
