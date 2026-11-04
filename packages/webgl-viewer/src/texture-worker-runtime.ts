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

interface WorkerImageSession {
  generation: number;
  blob: Blob;
  sourceDimensions: { width: number; height: number } | null;
  maxSourceBytes?: number;
  originalImage: ImageBitmap | null;
  sourcePromise: Promise<ImageBitmap | null> | null;
}

/** One handler owns one worker's source bitmap. Transferred outputs belong to the engine. */
export function createTextureWorkerHandler(
  postMessage: (
    message: TextureWorkerMessage,
    transfer?: Transferable[],
  ) => void,
): (message: TextureWorkerRequest) => Promise<void> {
  let session: WorkerImageSession | null = null;
  let activeSessionId = 0;
  let generation = 0;

  // Most visits only need the base texture. Keep compressed bytes until zoom
  // requests a tile, and share that one source decode across concurrent tiles.
  const getSourceImage = (current: WorkerImageSession) => {
    if (current.originalImage) return Promise.resolve(current.originalImage);
    current.sourcePromise ??= (async () => {
      let decoded: ImageBitmap | null = null;
      try {
        const target = current.sourceDimensions
          ? sourceImageDimensions(
              current.sourceDimensions,
              current.maxSourceBytes,
            )
          : null;
        decoded = await createImageBitmap(current.blob, {
          imageOrientation: "from-image",
          premultiplyAlpha: "none",
          ...(target && !sameDimensions(target, current.sourceDimensions!)
            ? {
                resizeWidth: target.width,
                resizeHeight: target.height,
                resizeQuality: "high" as const,
              }
            : {}),
        });
        if (generation !== current.generation) return null;
        current.sourceDimensions ??= {
          width: decoded.width,
          height: decoded.height,
        };
        const retained = sourceImageDimensions(decoded, current.maxSourceBytes);
        if (!sameDimensions(retained, decoded)) {
          const oversized = decoded;
          decoded = null;
          try {
            decoded = await createImageBitmap(oversized, {
              resizeWidth: retained.width,
              resizeHeight: retained.height,
              resizeQuality: "high",
              premultiplyAlpha: "none",
            });
          } finally {
            oversized.close();
          }
          if (generation !== current.generation) return null;
        }
        if (
          !sameDimensions(
            sourceImageDimensions(decoded, current.maxSourceBytes),
            decoded,
          )
        ) {
          throw new Error("Decoded image exceeds source pixel budget");
        }
        current.originalImage = decoded;
        decoded = null;
        postMessage({
          type: "source-ready",
          sessionId: activeSessionId,
          payload: {
            sourceWidth: current.originalImage.width,
            sourceHeight: current.originalImage.height,
          },
        });
        return current.originalImage;
      } finally {
        decoded?.close();
        current.sourcePromise = null;
      }
    })();
    return current.sourcePromise;
  };

  return async (message: TextureWorkerRequest): Promise<void> => {
    const { type, payload } = message;

    switch (type) {
      case "load-image": {
        const { sessionId } = payload;
        activeSessionId = sessionId;
        const currentGeneration = ++generation;
        session?.originalImage?.close();
        session = null;
        const {
          url,
          blob: sourceBlob,
          maxTextureSize,
          maxTextureBytes,
          maxSourceBytes,
        } = payload;
        let baseBitmap: ImageBitmap | null = null;
        try {
          const blob =
            sourceBlob ??
            (await (async () => {
              const response = await fetch(url, { mode: "cors" });
              if (!response.ok)
                throw new Error(`Image request failed: ${response.status}`);
              return response.blob();
            })());
          if (generation !== currentGeneration) return;
          const hint = {
            width: payload.imageWidth,
            height: payload.imageHeight,
          };
          const knownDimensions = hasImageDimensions(hint) ? hint : null;
          // Header dimensions are oriented encoded pixels; manifest hints only
          // define logical coordinates and must never force a source upscale.
          let sourceDimensions = await readSourceImageDimensions(blob);
          if (generation !== currentGeneration) return;
          const current: WorkerImageSession = {
            generation: currentGeneration,
            blob,
            sourceDimensions,
            maxSourceBytes,
            originalImage: null,
            sourcePromise: null,
          };
          if (payload.skipBaseTexture) {
            session = current;
            postMessage({ type: "init-done", sessionId });
            return;
          }
          let logicalDimensions = knownDimensions ?? sourceDimensions;
          const lodLevel = 1;
          const getBaseDimensions = () => {
            const retained = sourceImageDimensions(
              sourceDimensions!,
              maxSourceBytes,
            );
            return clampDimensionsToFit(
              Math.max(
                1,
                Math.min(
                  retained.width,
                  Math.round(
                    logicalDimensions!.width *
                      SIMPLE_LOD_LEVELS[lodLevel].scale,
                  ),
                ),
              ),
              Math.max(
                1,
                Math.min(
                  retained.height,
                  Math.round(
                    logicalDimensions!.height *
                      SIMPLE_LOD_LEVELS[lodLevel].scale,
                  ),
                ),
              ),
              maxTextureSize,
              maxTextureBytes,
            );
          };
          const target = sourceDimensions ? getBaseDimensions() : null;
          baseBitmap = await createImageBitmap(blob, {
            imageOrientation: "from-image",
            premultiplyAlpha: "none",
            ...(target && !sameDimensions(target, sourceDimensions!)
              ? {
                  resizeWidth: target.width,
                  resizeHeight: target.height,
                  resizeQuality: "medium" as const,
                }
              : {}),
          });
          if (generation !== currentGeneration) return;
          sourceDimensions ??= {
            width: baseBitmap.width,
            height: baseBitmap.height,
          };
          logicalDimensions ??= sourceDimensions;
          current.sourceDimensions = sourceDimensions;
          const baseTarget = getBaseDimensions();
          // Unknown headers need native discovery. Also defend against decoders
          // ignoring resize options, without retaining that oversized allocation.
          if (
            baseBitmap.width > baseTarget.width ||
            baseBitmap.height > baseTarget.height
          ) {
            const oversized = baseBitmap;
            baseBitmap = null;
            try {
              baseBitmap = await createImageBitmap(oversized, {
                resizeWidth: Math.min(oversized.width, baseTarget.width),
                resizeHeight: Math.min(oversized.height, baseTarget.height),
                resizeQuality: "medium",
                premultiplyAlpha: "none",
              });
            } finally {
              oversized.close();
            }
            if (generation !== currentGeneration) return;
          }
          if (
            baseBitmap.width > baseTarget.width ||
            baseBitmap.height > baseTarget.height
          ) {
            throw new Error("Decoded image exceeds base texture budget");
          }
          const sourceTarget = sourceImageDimensions(
            sourceDimensions,
            maxSourceBytes,
          );
          postMessage(
            {
              type: "image-loaded",
              sessionId,
              payload: {
                imageBitmap: baseBitmap,
                imageWidth: logicalDimensions.width,
                imageHeight: logicalDimensions.height,
                sourceWidth: sourceTarget.width,
                sourceHeight: sourceTarget.height,
                lodLevel,
              },
            },
            [baseBitmap],
          );
          baseBitmap = null;
          session = current;
          postMessage({ type: "init-done", sessionId });
        } catch (error) {
          if (generation === currentGeneration) {
            session?.originalImage?.close();
            session = null;
            postMessage({
              type: "load-error",
              sessionId,
              payload: { error: toErrorMessage(error) },
            });
          }
        } finally {
          baseBitmap?.close();
        }
        break;
      }
      case "create-tile": {
        const { sessionId } = payload;
        if (sessionId !== activeSessionId || !session) {
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
        const current = session;
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

          const originalImage = await getSourceImage(current);
          if (!originalImage || generation !== currentGeneration) return;

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

function sameDimensions(
  first: { width: number; height: number },
  second: { width: number; height: number },
): boolean {
  return first.width === second.width && first.height === second.height;
}
