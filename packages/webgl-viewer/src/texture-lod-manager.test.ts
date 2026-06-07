import { describe, expect, it, vi } from "vitest";

import { getLodQuality, TextureLodManager } from "./texture-lod-manager";

describe("TextureLodManager", () => {
  it("maps LOD levels to quality labels", () => {
    expect(getLodQuality(0)).toBe("low");
    expect(getLodQuality(1)).toBe("low");
    expect(getLodQuality(2)).toBe("medium");
    expect(getLodQuality(3)).toBe("high");
    expect(getLodQuality(99)).toBe("unknown");
  });

  it("replaces and disposes base textures without duplicate deletes", () => {
    const deleted: WebGLTexture[] = [];
    const gl: WebGLRenderingContext = Object.assign(Object.create(null), {
      deleteTexture: vi.fn((texture: WebGLTexture) => deleted.push(texture)),
    });
    const first = {} as WebGLTexture;
    const second = {} as WebGLTexture;
    const manager = new TextureLodManager(gl);

    manager.setBaseTexture(first, 1);
    manager.setBaseTexture(second, 2);

    expect(deleted).toEqual([first]);
    expect(manager.texture).toBe(second);
    expect(manager.currentLOD).toBe(2);
    expect(manager.textureCount).toBe(1);

    manager.dispose();
    manager.dispose();

    expect(deleted).toEqual([first, second]);
  });
});
