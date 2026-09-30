import { readSourceImageDimensions } from "./source-image-header";
import {
  hasImageDimensions,
  sourceImageDimensions,
} from "./source-image-policy";
import { clampDimensionsToFit } from "./texture-dimensions";
import { getTileGridSize, SIMPLE_LOD_LEVELS, TILE_SIZE } from "./tile-cache";
import type {
  TextureWorkerMessage,
  TextureWorkerRequest,
} from "./worker-protocol";

/** One handler owns one worker's source bitmap. Transferred outputs belong to the engine. */
export function createTextureWorkerHandler(
  postMessage: (
    message: TextureWorkerMessage,
    transfer?: Transferable[],
  ) => void,
): (message: TextureWorkerRequest) => Promise<void> {
  let originalImage: ImageBitmap | null = null;
  let activeSessionId = 0;
  let generation = 0;

  return async (message: TextureWorkerRequest): Promise<void> => {
    const { type, payload } = message;

    switch (type) {
      case "load-image": {
        // 上下文恢复会通过同一个存活 worker 重新 loadImage：旧的全尺寸 bitmap
        // （48MP 约 190MB）若等 GC 释放，恰好撞上引发上下文丢失的内存压力窗口。
        // 先置 null 再解码，解码期间到达的 create-tile 会走 !originalImage 守卫安全失败。
        const { sessionId } = payload;
        activeSessionId = sessionId;
        const currentGeneration = ++generation;
        if (originalImage) {
          originalImage.close();
          originalImage = null;
        }
        const {
          url,
          blob: sourceBlob,
          maxTextureSize,
          maxTextureBytes,
          maxSourceBytes,
        } = payload;
        let decodedImage: ImageBitmap | null = null;
        let initialLODBitmap: ImageBitmap | null = null;
        try {
          const blob =
            sourceBlob ??
            (await (async () => {
              const response = await fetch(url, { mode: "cors" });
              if (!response.ok)
                throw new Error(`Image request failed: ${response.status}`);
              return await response.blob();
            })());
          if (generation !== currentGeneration) return;
          const hint = {
            width: payload.imageWidth,
            height: payload.imageHeight,
          };
          const knownDimensions = hasImageDimensions(hint) ? hint : null;
          // Manifest dimensions are logical coordinates, not proof of the
          // encoded bitmap's size (converted media or stale manifests differ).
          const sourceDimensions = await readSourceImageDimensions(blob);
          if (generation !== currentGeneration) return;
          const target = sourceDimensions
            ? sourceImageDimensions(sourceDimensions, maxSourceBytes)
            : null;
          decodedImage = await createImageBitmap(blob, {
            // Manifest dimensions already include EXIF orientation. Decode in
            // that same display orientation before applying the target size.
            imageOrientation: "from-image",
            premultiplyAlpha: "none",
            ...(target &&
            (target.width !== sourceDimensions!.width ||
              target.height !== sourceDimensions!.height)
              ? {
                  resizeWidth: target.width,
                  resizeHeight: target.height,
                  resizeQuality: "high" as const,
                }
              : {}),
          });
          if (generation !== currentGeneration) {
            decodedImage.close();
            return;
          }
          const logicalDimensions = knownDimensions ??
            sourceDimensions ?? {
              width: decodedImage.width,
              height: decodedImage.height,
            };
          // Unknown/ambiguous headers use native dimension discovery, regardless
          // of manifest hints. Bound what we retain; decode buffers may be larger.
          const retained = sourceImageDimensions(decodedImage, maxSourceBytes);
          if (
            retained.width !== decodedImage.width ||
            retained.height !== decodedImage.height
          ) {
            const oversized = decodedImage;
            decodedImage = null;
            try {
              decodedImage = await createImageBitmap(oversized, {
                resizeWidth: retained.width,
                resizeHeight: retained.height,
                resizeQuality: "high",
                premultiplyAlpha: "none",
              });
            } finally {
              oversized.close();
            }
            if (generation !== currentGeneration) {
              decodedImage.close();
              return;
            }
          }
          const checked = sourceImageDimensions(decodedImage, maxSourceBytes);
          if (
            checked.width !== decodedImage.width ||
            checked.height !== decodedImage.height
          ) {
            throw new Error("Decoded image exceeds source pixel budget");
          }
          originalImage = decodedImage;
          decodedImage = null;

          // Create initial LOD texture
          const lodLevel = 1; // Initial LOD level
          const lodConfig = SIMPLE_LOD_LEVELS[lodLevel];
          // 底图按 0.5x 生成：超大原图（如 10000px 宽 → 5000px 底图）会超过老
          // iOS/Android GPU 的 MAX_TEXTURE_SIZE（常见 4096），texImage2D 静默失败、
          // 回退四边形渲染成黑块。按当前上下文的能力等比钳制到能容纳的最大尺寸。
          const { width: finalWidth, height: finalHeight } =
            clampDimensionsToFit(
              Math.max(
                1,
                Math.min(
                  originalImage.width,
                  Math.round(logicalDimensions.width * lodConfig.scale),
                ),
              ),
              Math.max(
                1,
                Math.min(
                  originalImage.height,
                  Math.round(logicalDimensions.height * lodConfig.scale),
                ),
              ),
              maxTextureSize,
              maxTextureBytes,
            );

          initialLODBitmap = await createImageBitmap(originalImage, {
            resizeWidth: finalWidth,
            resizeHeight: finalHeight,
            resizeQuality: "medium",
            premultiplyAlpha: "none",
          });
          if (generation !== currentGeneration) {
            initialLODBitmap.close();
            return;
          }

          postMessage(
            {
              type: "image-loaded",
              sessionId,
              payload: {
                imageBitmap: initialLODBitmap,
                imageWidth: logicalDimensions.width,
                imageHeight: logicalDimensions.height,
                sourceWidth: originalImage.width,
                sourceHeight: originalImage.height,
                lodLevel,
              },
            },
            [initialLODBitmap],
          );
          initialLODBitmap = null;
          postMessage({ type: "init-done", sessionId });
        } catch (error) {
          decodedImage?.close();
          initialLODBitmap?.close();
          if (generation === currentGeneration) {
            originalImage?.close();
            originalImage = null;
            postMessage({
              type: "load-error",
              sessionId,
              payload: { error: toErrorMessage(error) },
            });
          }
        }
        break;
      }
      case "create-tile": {
        const { sessionId } = payload;
        if (sessionId !== activeSessionId || !originalImage) {
          // 必须回 tile-error（引擎靠它把 key 移出 loadingTiles 重新排队）：
          // 静默丢弃会让上下文恢复窗口期到达的瓦片永远不再被请求。
          postMessage({
            type: "tile-error",
            sessionId,
            payload: { key: payload.key, error: "image not loaded" },
          });
          return;
        }

        const { x, y, lodLevel, imageWidth, imageHeight, key } = payload;
        const lodConfig = SIMPLE_LOD_LEVELS[lodLevel];
        const currentGeneration = generation;
        let tileBitmap: ImageBitmap | null = null;

        try {
          if (!lodConfig) throw new Error(`Invalid LOD level: ${lodLevel}`);
          const { cols, rows } = getTileGridSize({
            imageWidth,
            imageHeight,
            lodLevel,
          });
          if (
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            x < 0 ||
            y < 0 ||
            x >= cols ||
            y >= rows
          ) {
            throw new Error("Tile coordinates are outside the image");
          }

          // Calculate tile region in the original image
          // Grid positions remain in original-image coordinates. Crop the
          // bounded bitmap in its own pixels so downsampling never shifts tiles.
          // createImageBitmap crop arguments are integers. Shared boundaries
          // prevent fractional crops from losing a source pixel between tiles.
          const sourceX = Math.floor((x * originalImage.width) / cols);
          const sourceY = Math.floor((y * originalImage.height) / rows);
          const actualSourceWidth =
            Math.floor(((x + 1) * originalImage.width) / cols) - sourceX;
          const actualSourceHeight =
            Math.floor(((y + 1) * originalImage.height) / rows) - sourceY;

          const targetWidth = Math.min(
            TILE_SIZE,
            Math.ceil(
              Math.min(
                actualSourceWidth,
                (imageWidth / cols) * lodConfig.scale,
              ),
            ),
          );
          const targetHeight = Math.min(
            TILE_SIZE,
            Math.ceil(
              Math.min(
                actualSourceHeight,
                (imageHeight / rows) * lodConfig.scale,
              ),
            ),
          );

          if (targetWidth <= 0 || targetHeight <= 0) {
            postMessage({
              type: "tile-error",
              sessionId,
              payload: { key, error: "tile has empty dimensions" },
            });
            return;
          }

          // Decode base and tiles with the same unpremultiplied-alpha policy.
          // The renderer replaces base pixels with tile pixels instead of
          // source-over compositing the same translucent source twice.
          tileBitmap = await createImageBitmap(
            originalImage,
            sourceX,
            sourceY,
            actualSourceWidth,
            actualSourceHeight,
            {
              resizeWidth: targetWidth,
              resizeHeight: targetHeight,
              resizeQuality: lodConfig.scale >= 1 ? "high" : "medium",
              premultiplyAlpha: "none",
            },
          );
          if (generation !== currentGeneration) {
            tileBitmap.close();
            return;
          }
          postMessage(
            {
              type: "tile-created",
              sessionId,
              payload: { key, imageBitmap: tileBitmap, lodLevel },
            },
            [tileBitmap],
          );
          tileBitmap = null;
        } catch (error) {
          tileBitmap?.close();
          if (generation === currentGeneration) {
            postMessage({
              type: "tile-error",
              sessionId,
              payload: { key, error: toErrorMessage(error) },
            });
          }
        }
        break;
      }
    }
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
