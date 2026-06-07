import type { DebugInfo } from "./interface";
import type { TileInfo, TileKey } from "./tile-cache";
import { MAX_TILES_PER_FRAME, TILE_CACHE_SIZE, TILE_SIZE } from "./tile-cache";

export interface WebGLDebugAdapterInput {
  scale: number;
  translateX: number;
  translateY: number;
  currentLOD: number;
  lodLevelCount: number;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  fitToScreenScale: number;
  userMaxScale: number;
  effectiveMaxScale: number;
  originalSizeScale: number;
  maxTextureSize: number;
  quality: "high" | "medium" | "low" | "unknown";
  isLoading: boolean;
  lodTextureCount: number;
  tileOutlineEnabled: boolean;
  tileCache: Map<TileKey, TileInfo>;
  currentVisibleTiles: Set<TileKey>;
  loadingTiles: Map<TileKey, { priority: number }>;
  pendingTileRequests: Map<TileKey, number>;
}

export function createWebGLDebugInfo(input: WebGLDebugAdapterInput): DebugInfo {
  const tileMemoryMB = input.tileCache.size * 4;
  const totalMemoryMB = tileMemoryMB + input.lodTextureCount * 16;
  const memoryBudget = 256;

  return {
    scale: input.scale,
    relativeScale: input.scale / input.fitToScreenScale,
    translateX: input.translateX,
    translateY: input.translateY,
    currentLOD: input.currentLOD,
    lodLevels: input.lodLevelCount,
    canvasSize: { width: input.canvasWidth, height: input.canvasHeight },
    imageSize: { width: input.imageWidth, height: input.imageHeight },
    fitToScreenScale: input.fitToScreenScale,
    userMaxScale: input.userMaxScale,
    effectiveMaxScale: input.effectiveMaxScale,
    originalSizeScale: input.originalSizeScale,
    renderCount: performance.now(),
    maxTextureSize: input.maxTextureSize,
    quality: input.quality,
    isLoading: input.isLoading,
    memory: {
      textures: totalMemoryMB,
      estimated: totalMemoryMB,
      budget: memoryBudget,
      pressure: (totalMemoryMB / memoryBudget) * 100,
      activeLODs: input.lodTextureCount,
      maxConcurrentLODs: 3,
      onDemandStrategy: true,
    },
    tileOutlinesEnabled: input.tileOutlineEnabled,
    tileSystem: {
      cacheSize: input.tileCache.size,
      visibleTiles: input.currentVisibleTiles.size,
      loadingTiles: input.loadingTiles.size,
      pendingRequests: input.pendingTileRequests.size,
      cacheLimit: TILE_CACHE_SIZE,
      maxTilesPerFrame: MAX_TILES_PER_FRAME,
      tileSize: TILE_SIZE,
      cacheKeys: Array.from(input.tileCache.keys()),
      visibleKeys: Array.from(input.currentVisibleTiles),
      loadingKeys: Array.from(input.loadingTiles.keys()),
      pendingKeys: Array.from(input.pendingTileRequests.keys()),
    },
  };
}
