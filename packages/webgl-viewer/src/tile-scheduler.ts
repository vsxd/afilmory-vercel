import type { TileKey } from "./tile-cache";
import {
  createTileKey,
  getTileGridSize,
  getTilePixelSize,
  TEXTURE_BYTES_PER_PIXEL,
} from "./tile-cache";

export interface VisibleTile {
  lodLevel: number;
  priority: number;
  x: number;
  y: number;
}

export interface VisibleTileInput {
  canvasHeight: number;
  canvasWidth: number;
  imageHeight: number;
  imageLoaded: boolean;
  imageWidth: number;
  lodLevel: number;
  scale: number;
  translateX: number;
  translateY: number;
}

export interface PendingTileRequest {
  key: TileKey;
  priority: number;
}

export function createViewportHash(input: {
  scale: number;
  translateX: number;
  translateY: number;
}): string {
  return `${input.scale.toFixed(3)}-${input.translateX.toFixed(1)}-${input.translateY.toFixed(1)}`;
}

function getVisibleTileRange(input: VisibleTileInput, margin: number) {
  if (
    !input.imageLoaded ||
    input.scale <= 0 ||
    input.canvasWidth <= 0 ||
    input.canvasHeight <= 0 ||
    input.imageWidth <= 0 ||
    input.imageHeight <= 0
  )
    return null;

  const { cols, rows } = getTileGridSize({
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    lodLevel: input.lodLevel,
  });

  const imageCenterInCanvasX = input.canvasWidth / 2 + input.translateX;
  const imageCenterInCanvasY = input.canvasHeight / 2 + input.translateY;
  const scaledImageWidth = input.imageWidth * input.scale;
  const scaledImageHeight = input.imageHeight * input.scale;
  const imageLeftInCanvas = imageCenterInCanvasX - scaledImageWidth / 2;
  const imageTopInCanvas = imageCenterInCanvasY - scaledImageHeight / 2;

  const viewLeft = Math.max(0, -imageLeftInCanvas / input.scale);
  const viewTop = Math.max(0, -imageTopInCanvas / input.scale);
  const viewRight = Math.min(
    input.imageWidth,
    (input.canvasWidth - imageLeftInCanvas) / input.scale,
  );
  const viewBottom = Math.min(
    input.imageHeight,
    (input.canvasHeight - imageTopInCanvas) / input.scale,
  );
  if (viewRight <= viewLeft || viewBottom <= viewTop) return null;

  const tileWidthInImage = input.imageWidth / cols;
  const tileHeightInImage = input.imageHeight / rows;
  const startTileX = Math.max(
    0,
    Math.floor(viewLeft / tileWidthInImage) - margin,
  );
  const endTileX = Math.min(
    cols - 1,
    Math.ceil(viewRight / tileWidthInImage) - 1 + margin,
  );
  const startTileY = Math.max(
    0,
    Math.floor(viewTop / tileHeightInImage) - margin,
  );
  const endTileY = Math.min(
    rows - 1,
    Math.ceil(viewBottom / tileHeightInImage) - 1 + margin,
  );

  return {
    startTileX,
    endTileX,
    startTileY,
    endTileY,
    tileWidthInImage,
    tileHeightInImage,
    viewCenterX: (viewLeft + viewRight) / 2,
    viewCenterY: (viewTop + viewBottom) / 2,
  };
}

export function calculateVisibleTiles(
  input: VisibleTileInput,
  margin = 0,
): VisibleTile[] {
  const range = getVisibleTileRange(input, margin);
  if (!range) return [];
  const {
    startTileX,
    endTileX,
    startTileY,
    endTileY,
    tileWidthInImage,
    tileHeightInImage,
    viewCenterX,
    viewCenterY,
  } = range;

  const visibleTiles: VisibleTile[] = [];

  for (let y = startTileY; y <= endTileY; y++) {
    for (let x = startTileX; x <= endTileX; x++) {
      const tileCenterX = (x + 0.5) * tileWidthInImage;
      const tileCenterY = (y + 0.5) * tileHeightInImage;
      const priority = Math.sqrt(
        Math.pow(tileCenterX - viewCenterX, 2) +
          Math.pow(tileCenterY - viewCenterY, 2),
      );

      visibleTiles.push({
        x,
        y,
        lodLevel: input.lodLevel,
        priority,
      });
    }
  }

  return visibleTiles.sort((a, b) => a.priority - b.priority);
}

export interface TileBudget {
  maxCacheBytes: number;
  maxCacheSize: number;
}

export interface TilePlan {
  /** null means that only the always-rendered base texture is needed. */
  lodLevel: number | null;
  visibleTiles: VisibleTile[];
  prefetchTiles: VisibleTile[];
  byteSize: number;
}

/** Choose visible detail first; the optional one-tile border uses only spare budget. */
export function planTilesWithinBudget(
  input: VisibleTileInput,
  budget: TileBudget,
  isLodCoveredByBase: (lodLevel: number) => boolean,
): TilePlan {
  const baseOnly: TilePlan = {
    lodLevel: null,
    visibleTiles: [],
    prefetchTiles: [],
    byteSize: 0,
  };
  for (let { lodLevel } = input; lodLevel >= 0; lodLevel--) {
    if (isLodCoveredByBase(lodLevel)) return baseOnly;
    const candidate = { ...input, lodLevel };
    const range = getVisibleTileRange(candidate, 0);
    if (!range) return baseOnly;
    const count =
      (range.endTileX - range.startTileX + 1) *
      (range.endTileY - range.startTileY + 1);
    // Bound enumeration even for enormous image metadata at a very small zoom.
    if (count > budget.maxCacheSize) continue;
    const bytesFor = (tile: VisibleTile) => {
      const size = getTilePixelSize({ ...candidate, ...tile });
      return size.width * size.height * TEXTURE_BYTES_PER_PIXEL;
    };
    const visibleTiles = calculateVisibleTiles(candidate);
    let byteSize = visibleTiles.reduce(
      (bytes, tile) => bytes + bytesFor(tile),
      0,
    );
    if (byteSize > budget.maxCacheBytes) continue;
    const visibleKeys = new Set(
      visibleTiles.map((tile) => createTileKey(tile.x, tile.y, lodLevel)),
    );
    const prefetchTiles: VisibleTile[] = [];
    for (const tile of calculateVisibleTiles(candidate, 1)) {
      if (visibleKeys.has(createTileKey(tile.x, tile.y, lodLevel))) continue;
      if (visibleTiles.length + prefetchTiles.length >= budget.maxCacheSize)
        break;
      const bytes = bytesFor(tile);
      if (byteSize + bytes > budget.maxCacheBytes) continue;
      prefetchTiles.push(tile);
      byteSize += bytes;
    }
    return { lodLevel, visibleTiles, prefetchTiles, byteSize };
  }
  return baseOnly;
}

export function selectPendingTileBatch(
  requests: Map<TileKey, number>,
  maxTilesPerFrame: number,
): PendingTileRequest[] {
  const sortedRequests = Array.from(requests.entries())
    .map(([key, priority]) => ({ key, priority }))
    .sort((a, b) => a.priority - b.priority);
  const halfCount = Math.max(1, Math.ceil(sortedRequests.length / 2));
  const batchSize = Math.min(maxTilesPerFrame, halfCount);

  return sortedRequests.slice(0, batchSize);
}
