import type { TileKey } from "./tile-cache";
import { getTileGridSize } from "./tile-cache";

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

export function calculateVisibleTiles(input: VisibleTileInput): VisibleTile[] {
  if (!input.imageLoaded) return [];

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

  const tileWidthInImage = input.imageWidth / cols;
  const tileHeightInImage = input.imageHeight / rows;
  const margin = 1;
  const startTileX = Math.max(
    0,
    Math.floor(viewLeft / tileWidthInImage) - margin,
  );
  const endTileX = Math.min(
    cols - 1,
    Math.ceil(viewRight / tileWidthInImage) + margin,
  );
  const startTileY = Math.max(
    0,
    Math.floor(viewTop / tileHeightInImage) - margin,
  );
  const endTileY = Math.min(
    rows - 1,
    Math.ceil(viewBottom / tileHeightInImage) + margin,
  );

  const visibleTiles: VisibleTile[] = [];
  const viewCenterX = (viewLeft + viewRight) / 2;
  const viewCenterY = (viewTop + viewBottom) / 2;

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
