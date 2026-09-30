import { SIMPLE_LOD_LEVELS } from "./tile-cache";

export type TextureQuality = "high" | "medium" | "low" | "unknown";

export function getLodQuality(
  lodLevel: number,
  availableScale = Infinity,
): TextureQuality {
  const lodConfig = SIMPLE_LOD_LEVELS[lodLevel];
  if (!lodConfig) return "unknown";
  const scale = Math.min(lodConfig.scale, availableScale);
  if (scale >= 2) return "high";
  if (scale >= 1) return "medium";
  return "low";
}

/**
 * Holds the single base (fallback) texture and the LOD level it was produced
 * at. There is intentionally only ever one: setting a new base texture
 * disposes the previous one first.
 */
export class TextureLodManager {
  private baseTexture: WebGLTexture | null = null;
  private activeLOD = 1;

  constructor(private readonly gl: WebGLRenderingContext) {}

  get texture(): WebGLTexture | null {
    return this.baseTexture;
  }

  get currentLOD(): number {
    return this.activeLOD;
  }

  get hasTexture(): boolean {
    return this.baseTexture !== null;
  }

  setBaseTexture(texture: WebGLTexture, lodLevel: number): void {
    this.dispose();
    this.baseTexture = texture;
    this.activeLOD = lodLevel;
  }

  dispose(): void {
    if (this.baseTexture) {
      this.gl.deleteTexture(this.baseTexture);
    }
    this.baseTexture = null;
    this.activeLOD = 1;
  }
}
