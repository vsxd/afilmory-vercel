import { describe, expect, it, vi } from "vitest";

import type { CachedBaseTexture } from "./base-texture-cache";
import { BaseTextureCache } from "./base-texture-cache";

function entry(width: number): CachedBaseTexture {
  return {
    texture: {} as WebGLTexture,
    imageWidth: width,
    imageHeight: 1,
    lodLevel: 1,
    size: { width, height: 1 },
    sourceSize: { width, height: 1 },
  };
}

describe("context-local base textures", () => {
  it("transfers ownership on a hit and bounds inactive texture bytes", () => {
    const release = vi.fn();
    const cache = new BaseTextureCache(release, 80, 2);
    const a = entry(10);
    const b = entry(10);
    const c = entry(15);
    cache.put("a", a);
    cache.put("b", b);
    expect(cache.take("a")).toBe(a);
    expect(release).not.toHaveBeenCalled();
    cache.put("a", a);
    cache.put("c", c);
    expect(release.mock.calls.map(([texture]) => texture)).toEqual([
      b.texture,
      a.texture,
    ]);
    expect(cache.byteSize).toBe(60);
    expect(cache.take("c")).toBe(c);
    expect(cache.byteSize).toBe(0);
  });

  it("isolates new versions of a URL by blob identity", () => {
    const release = vi.fn();
    const cache = new BaseTextureCache(release, 100);
    const first = new Blob(["first"]);
    const second = new Blob(["second"]);
    const texture = entry(10);
    cache.put(first, texture);
    expect(cache.take(second)).toBeUndefined();
    expect(cache.take(first)).toBe(texture);
  });

  it("drops lost-context handles and releases valid resources exactly once", () => {
    const release = vi.fn();
    const cache = new BaseTextureCache(release, 100);
    cache.put("lost", entry(10));
    cache.clear(false);
    expect(release).not.toHaveBeenCalled();
    expect(cache.take("lost")).toBeUndefined();
    const current = entry(10);
    cache.put("current", current);
    cache.clear();
    cache.clear();
    expect(release).toHaveBeenCalledExactlyOnceWith(current.texture);
    expect(cache.byteSize).toBe(0);
  });
});
