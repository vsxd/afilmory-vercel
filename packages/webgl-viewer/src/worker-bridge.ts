import TextureWorkerRaw from "./texture.worker?raw";
import { SIMPLE_LOD_LEVELS, TILE_SIZE } from "./tile-cache";

/** Keep one fallback texture below 64 MiB even on 8K-capable GPUs. */
export const BASE_TEXTURE_BYTE_BUDGET = 64 * 1024 * 1024;

/**
 * 等比缩小到边长与 RGBA8 字节预算内的最大尺寸；非正上限表示不应用该上限。
 *
 * The function is serialized into a worker with toString(). Keep it closed
 * over no module bindings: minification renames those outside the raw worker.
 */
export function clampDimensionsToFit(
  width: number,
  height: number,
  maxSize: number,
  maxBytes = 0,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: Math.max(0, width), height: Math.max(0, height) };
  }
  const sizeRatio =
    maxSize > 0 ? Math.min(1, maxSize / width, maxSize / height) : 1;
  const byteRatio =
    maxBytes > 0
      ? Math.min(
          1,
          Math.sqrt(maxBytes / (width * height * 4)), // RGBA8 bytes per pixel
        )
      : 1;
  const ratio = Math.min(sizeRatio, byteRatio);
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
  };
}

/**
 * texture.worker.js is instantiated from raw text, so we prepend the shared
 * constants as a generated prelude. tile-cache.ts is the single source of
 * truth for TILE_SIZE / SIMPLE_LOD_LEVELS — no hand-kept copies in the worker.
 * clampDimensionsToFit is injected the same way (single implementation, unit
 * tested here); the per-context MAX_TEXTURE_SIZE cap itself travels in the
 * load-image message, not the prelude.
 */
export function buildTextureWorkerSource(): string {
  const prelude =
    `const TILE_SIZE = ${TILE_SIZE};\n` +
    `const SIMPLE_LOD_LEVELS = ${JSON.stringify(SIMPLE_LOD_LEVELS)};\n` +
    `const clampDimensionsToFit = ${clampDimensionsToFit.toString()};\n`;
  return prelude + TextureWorkerRaw;
}

export class TextureWorkerBridge {
  private readonly workerUrl: string;
  private readonly worker: Worker;
  private disposed = false;

  constructor(input: {
    onMessage: (event: MessageEvent) => void;
    onError?: (event: ErrorEvent) => void;
    onMessageError?: (event: MessageEvent) => void;
  }) {
    this.workerUrl = URL.createObjectURL(
      new Blob([buildTextureWorkerSource()]),
    );
    try {
      this.worker = new Worker(this.workerUrl, {
        name: "texture-worker",
      });
    } catch (error) {
      URL.revokeObjectURL(this.workerUrl);
      throw error;
    }
    this.worker.onmessage = input.onMessage;
    this.worker.onerror =
      input.onError ??
      ((event) => {
        console.error("[Worker] Error:", event.message, event.error);
      });
    this.worker.onmessageerror =
      input.onMessageError ??
      ((event) => {
        console.error("[Worker] Message error:", event.data);
      });
  }

  loadImage(input: {
    sessionId: number;
    url: string;
    blob: Blob | null;
    /** gl.MAX_TEXTURE_SIZE of the target context; 0 = unknown (no clamp). */
    maxTextureSize: number;
    maxTextureBytes: number;
  }): void {
    this.worker.postMessage({
      type: "load-image",
      payload: input,
    });
  }

  createTile(input: {
    sessionId: number;
    x: number;
    y: number;
    lodLevel: number;
    lodConfig: { scale: number };
    imageWidth: number;
    imageHeight: number;
    key: string;
  }): void {
    this.worker.postMessage({
      type: "create-tile",
      payload: input,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    URL.revokeObjectURL(this.workerUrl);
  }
}
