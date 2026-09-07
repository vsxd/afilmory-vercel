/// <reference lib="webworker" />

// TILE_SIZE, SIMPLE_LOD_LEVELS and
// clampDimensionsToFit are injected by
// worker-bridge.ts as a generated prelude (single source of truth:
// tile-cache.ts / worker-bridge.ts). Do not declare them here.
/* global TILE_SIZE, SIMPLE_LOD_LEVELS, clampDimensionsToFit */

let originalImage = null;
let activeSessionId = 0;

/**
 *
 * @param {MessageEvent} e
 * @returns
 */
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case "load-image": {
      // 上下文恢复会通过同一个存活 worker 重新 loadImage：旧的全尺寸 bitmap
      // （48MP 约 190MB）若等 GC 释放，恰好撞上引发上下文丢失的内存压力窗口。
      // 先置 null 再解码，解码期间到达的 create-tile 会走 !originalImage 守卫安全失败。
      const { sessionId } = payload;
      activeSessionId = sessionId;
      if (originalImage) {
        originalImage.close();
        originalImage = null;
      }
      const {
        url,
        blob: sourceBlob,
        maxTextureSize,
        maxTextureBytes,
      } = payload;
      let decodedImage = null;
      let initialLODBitmap = null;
      try {
        const blob =
          sourceBlob ??
          (await (async () => {
            const response = await fetch(url, { mode: "cors" });
            return await response.blob();
          })());
        decodedImage = await createImageBitmap(blob, {
          premultiplyAlpha: "none",
        });
        if (activeSessionId !== sessionId) {
          decodedImage.close();
          return;
        }
        originalImage = decodedImage;
        decodedImage = null;

        // Create initial LOD texture
        const lodLevel = 1; // Initial LOD level
        const lodConfig = SIMPLE_LOD_LEVELS[lodLevel];
        // 底图按 0.5x 生成：超大原图（如 10000px 宽 → 5000px 底图）会超过老
        // iOS/Android GPU 的 MAX_TEXTURE_SIZE（常见 4096），texImage2D 静默失败、
        // 回退四边形渲染成黑块。按当前上下文的能力等比钳制到能容纳的最大尺寸。
        const { width: finalWidth, height: finalHeight } = clampDimensionsToFit(
          Math.max(1, Math.round(originalImage.width * lodConfig.scale)),
          Math.max(1, Math.round(originalImage.height * lodConfig.scale)),
          maxTextureSize,
          maxTextureBytes,
        );

        initialLODBitmap = await createImageBitmap(originalImage, {
          resizeWidth: finalWidth,
          resizeHeight: finalHeight,
          resizeQuality: "medium",
          premultiplyAlpha: "none",
        });
        if (activeSessionId !== sessionId) {
          initialLODBitmap.close();
          return;
        }

        self.postMessage(
          {
            type: "image-loaded",
            sessionId,
            payload: {
              imageBitmap: initialLODBitmap,
              imageWidth: originalImage.width,
              imageHeight: originalImage.height,
              lodLevel,
            },
          },
          [initialLODBitmap],
        );
        initialLODBitmap = null;
        self.postMessage({ type: "init-done", sessionId });
      } catch (error) {
        decodedImage?.close();
        initialLODBitmap?.close();
        if (activeSessionId === sessionId) {
          originalImage?.close();
          originalImage = null;
          console.error("[Worker] Error loading image:", error);
          self.postMessage({
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
        console.warn("Worker has not been initialized with an image.");
        self.postMessage({
          type: "tile-error",
          sessionId,
          payload: { key: payload.key, error: "image not loaded" },
        });
        return;
      }

      const { x, y, lodLevel, lodConfig, imageWidth, imageHeight, key } =
        payload;

      try {
        const { cols, rows } = getTileGridSize(
          imageWidth,
          imageHeight,
          lodLevel,
          lodConfig,
        );

        // Calculate tile region in the original image
        const sourceWidth = imageWidth / cols;
        const sourceHeight = imageHeight / rows; // Assuming square tiles from a square grid on the image
        const sourceX = x * sourceWidth;
        const sourceY = y * sourceHeight;

        const actualSourceWidth = Math.min(sourceWidth, imageWidth - sourceX);
        const actualSourceHeight = Math.min(
          sourceHeight,
          imageHeight - sourceY,
        );

        const targetWidth = Math.min(
          TILE_SIZE,
          Math.ceil(actualSourceWidth * lodConfig.scale),
        );
        const targetHeight = Math.min(
          TILE_SIZE,
          Math.ceil(actualSourceHeight * lodConfig.scale),
        );

        if (targetWidth <= 0 || targetHeight <= 0) {
          self.postMessage({
            type: "tile-error",
            sessionId,
            payload: { key, error: "tile has empty dimensions" },
          });
          return;
        }

        // Decode base and tiles with the same unpremultiplied-alpha policy.
        // The renderer replaces base pixels with tile pixels instead of
        // source-over compositing the same translucent source twice.
        const imageBitmap = await createImageBitmap(
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
        if (sessionId !== activeSessionId) {
          imageBitmap.close();
          return;
        }
        self.postMessage(
          {
            type: "tile-created",
            sessionId,
            payload: { key, imageBitmap, lodLevel },
          },
          [imageBitmap],
        );
      } catch (error) {
        console.error("Error creating tile in worker:", error);
        if (sessionId === activeSessionId) {
          self.postMessage({
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

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 *
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} _lodLevel
 * @param {object} lodConfig
 * @returns
 */
function getTileGridSize(imageWidth, imageHeight, _lodLevel, lodConfig) {
  const scaledWidth = imageWidth * lodConfig.scale;
  const scaledHeight = imageHeight * lodConfig.scale;

  const cols = Math.ceil(scaledWidth / TILE_SIZE);
  const rows = Math.ceil(scaledHeight / TILE_SIZE);

  return { cols, rows };
}
