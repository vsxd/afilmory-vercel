import { SIMPLE_LOD_LEVELS } from "./tile-cache";

export type TextureQuality = "high" | "medium" | "low" | "unknown";

export function getLodQuality(lodLevel: number): TextureQuality {
  const lodConfig = SIMPLE_LOD_LEVELS[lodLevel];
  if (!lodConfig) return "unknown";
  if (lodConfig.scale >= 2) return "high";
  if (lodConfig.scale >= 1) return "medium";
  return "low";
}

export class TextureLodManager {
  private baseTexture: WebGLTexture | null = null;
  private readonly lodTextures = new Map<number, WebGLTexture>();
  private activeLOD = 1;

  constructor(private readonly gl: WebGLRenderingContext) {}

  get texture(): WebGLTexture | null {
    return this.baseTexture;
  }

  get currentLOD(): number {
    return this.activeLOD;
  }

  get textureCount(): number {
    return this.lodTextures.size;
  }

  setBaseTexture(texture: WebGLTexture, lodLevel: number): void {
    this.dispose();
    this.baseTexture = texture;
    this.activeLOD = lodLevel;
    this.lodTextures.set(lodLevel, texture);
  }

  dispose(): void {
    for (const texture of this.lodTextures.values()) {
      this.gl.deleteTexture(texture);
    }
    this.lodTextures.clear();
    this.baseTexture = null;
    this.activeLOD = 1;
  }
}
