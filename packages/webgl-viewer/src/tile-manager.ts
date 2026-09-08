import type { TileInfo, TileKey } from "./tile-cache";
import {
  createTileKey,
  getTileGridSize,
  MAX_TILES_PER_FRAME,
  parseTileKey,
  TEXTURE_BYTES_PER_PIXEL,
  TILE_CACHE_BYTE_BUDGET,
  TILE_CACHE_SIZE,
} from "./tile-cache";
import type { LoadingTileInfo } from "./tile-request-runtime";
import { TileRequestRuntime } from "./tile-request-runtime";
import { calculateVisibleTiles, createViewportHash } from "./tile-scheduler";
import {
  cleanupTileTextures,
  disposeAllTileTextures,
} from "./tile-texture-cleanup";
import type {
  TextureWorkerMessage,
  TextureWorkerRequest,
} from "./worker-protocol";

type SessionlessWorkerMessage = TextureWorkerMessage extends infer Message
  ? Message extends { sessionId: number }
    ? Omit<Message, "sessionId">
    : never
  : never;

/** 渲染循环里瓦片更新的防抖间隔（毫秒）。 */
const TILE_UPDATE_DEBOUNCE_MS = 100;

/** Snapshot of the viewport/transform the tile subsystem needs for one update. */
export interface TileViewportState {
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  imageLoaded: boolean;
  scale: number;
  translateX: number;
  translateY: number;
}

export type TileWorkerRequest = Omit<
  Extract<TextureWorkerRequest, { type: "create-tile" }>["payload"],
  "sessionId"
>;

/**
 * The small surface the tile subsystem needs from the engine. Everything else
 * (transform math, lifecycle, worker ownership) stays in the engine.
 */
export interface TileManagerHost {
  /** Current viewport/transform snapshot for visibility + matrix math. */
  getViewport: () => TileViewportState;
  /** LOD level the engine currently wants on screen. */
  getSelectedLodLevel: () => number;
  /**
   * True while the always-rendered base texture already delivers ≥ the
   * resolution this LOD would produce. Tiles below that only re-decode the
   * base's content (~2× GPU memory for zero quality gain), so the manager
   * skips queueing entirely until the zoom passes base resolution.
   */
  isLodCoveredByBase: (lodLevel: number) => boolean;
  /** Upload a decoded tile bitmap into a GL texture (via the renderer). */
  createTexture: (source: ImageBitmap) => WebGLTexture;
  deleteTexture: (texture: WebGLTexture) => void;
  /** Repaint request — a tile that is currently visible became renderable. */
  requestRender: () => void;
  /** false while destroyed / context lost / worker not ready: pause dispatch. */
  canDispatchTiles: () => boolean;
  /** Post a create-tile request to the texture worker. */
  requestTileFromWorker: (request: TileWorkerRequest) => void;
  /**
   * Fired when every tile in the current visible set (all at `lodLevel`) has a
   * cached texture, i.e. the screen is fully covered at that LOD. May fire
   * repeatedly for the same LOD — callers dedupe.
   */
  onVisibleLodReady: (lodLevel: number) => void;
  /**
   * Fired when an update takes the base-coverage skip path: no tiles are (or
   * will be) drawn, so the screen now shows only the base texture. The engine's
   * quality signal is otherwise refreshed exclusively by `onVisibleLodReady`,
   * which never fires here — so zooming back to fit after tiles were active
   * would leave a stale (too-high) quality. Callers dedupe.
   */
  onCoveredByBase?: () => void;
}

/**
 * 计算单个瓦片的渲染变换矩阵（纯函数，坐标推导与 texture-worker-runtime.ts 的切片
 * 几何保持一致）。
 */
export function createTileMatrix(input: {
  tileX: number;
  tileY: number;
  lodLevel: number;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  scale: number;
  translateX: number;
  translateY: number;
}): Float32Array {
  const { cols, rows } = getTileGridSize({
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    lodLevel: input.lodLevel,
  });

  // 计算瓦片在原图中的区域
  const tileWidthInImage = input.imageWidth / cols;
  const tileHeightInImage = input.imageHeight / rows;

  // 瓦片在原图中的边界
  const tileLeftInImage = input.tileX * tileWidthInImage;
  const tileTopInImage = input.tileY * tileHeightInImage;
  const tileRightInImage = Math.min(
    input.imageWidth,
    tileLeftInImage + tileWidthInImage,
  );
  const tileBottomInImage = Math.min(
    input.imageHeight,
    tileTopInImage + tileHeightInImage,
  );

  // 瓦片的实际尺寸（处理边界情况）
  const actualTileWidth = tileRightInImage - tileLeftInImage;
  const actualTileHeight = tileBottomInImage - tileTopInImage;

  // 瓦片中心在原图中的位置
  const tileCenterInImageX = tileLeftInImage + actualTileWidth / 2;
  const tileCenterInImageY = tileTopInImage + actualTileHeight / 2;

  // 将瓦片中心转换到相对于图像中心的坐标
  const tileCenterRelativeX = tileCenterInImageX - input.imageWidth / 2;
  const tileCenterRelativeY = tileCenterInImageY - input.imageHeight / 2;

  // 计算瓦片在 canvas 中的位置
  const tileCenterInCanvasX =
    input.canvasWidth / 2 +
    input.translateX +
    tileCenterRelativeX * input.scale;
  const tileCenterInCanvasY =
    input.canvasHeight / 2 +
    input.translateY +
    tileCenterRelativeY * input.scale;

  // 计算瓦片在 canvas 中的尺寸
  const tileWidthInCanvas = actualTileWidth * input.scale;
  const tileHeightInCanvas = actualTileHeight * input.scale;

  // 转换到 WebGL 归一化坐标系 (-1 到 1)
  const scaleX = tileWidthInCanvas / input.canvasWidth;
  const scaleY = tileHeightInCanvas / input.canvasHeight;

  const translateX = (tileCenterInCanvasX * 2) / input.canvasWidth - 1;
  const translateY = -((tileCenterInCanvasY * 2) / input.canvasHeight - 1);

  return new Float32Array([
    scaleX,
    0,
    0,
    0,
    scaleY,
    0,
    translateX,
    translateY,
    1,
  ]);
}

/**
 * Owns the tile subsystem: the LRU texture cache, the pending/loading request
 * runtime, the visible tile set, the per-frame dispatch loop, and the
 * render-loop debounce. The engine talks to it through {@link TileManagerHost}
 * and two lifecycle entry points: `reset()` (context loss) and `dispose()`
 * (engine teardown).
 */
export class TileManager {
  private readonly cache = new Map<TileKey, TileInfo>();
  private readonly requestRuntime = new TileRequestRuntime();
  private visibleTiles = new Set<TileKey>();
  /** LOD level the current visible set was computed for. */
  private visibleLodLevel = -1;
  private lastViewportHash = "";
  private processingFrameId: number | null = null;
  private updateTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastUpdateTime = 0;
  private disposed = false;

  constructor(private readonly host: TileManagerHost) {}

  // ---- Read-only views for the debug overlay -------------------------------

  get tileCache(): ReadonlyMap<TileKey, TileInfo> {
    return this.cache;
  }

  get currentVisibleTiles(): ReadonlySet<TileKey> {
    return this.visibleTiles;
  }

  get loadingTiles(): ReadonlyMap<TileKey, LoadingTileInfo> {
    return this.requestRuntime.loadingTiles;
  }

  get pendingTileRequests(): ReadonlyMap<TileKey, number> {
    return this.requestRuntime.pendingTileRequests;
  }

  // ---- Worker message handling ---------------------------------------------

  /**
   * Handle a tile-related worker message. Returns true when the message was a
   * tile message (consumed here); false so the engine can handle the rest.
   */
  handleWorkerMessage(
    message: TextureWorkerMessage | SessionlessWorkerMessage,
  ): boolean {
    if (message.type === "tile-created") {
      this.handleTileCreated(message.payload);
      return true;
    }

    if (message.type === "tile-error") {
      const { key, error } = message.payload;
      console.warn(`Worker failed to create tile: ${key}`, error);
      this.requestRuntime.markFailed(key);
      return true;
    }

    return false;
  }

  private handleTileCreated(payload: {
    key: TileKey;
    imageBitmap: ImageBitmap;
    lodLevel: number;
  }): void {
    const { key, imageBitmap, lodLevel } = payload;

    if (this.disposed) {
      imageBitmap.close();
      return;
    }

    const loadingInfo = this.requestRuntime.getLoadingInfo(key);
    const tileInfoInCache = this.cache.get(key);

    // Tile might have been loaded by other means or is no longer needed
    if (!this.visibleTiles.has(key)) {
      imageBitmap.close();
      if (loadingInfo) {
        this.requestRuntime.markLoaded(key);
      }
      return;
    }

    const byteSize =
      imageBitmap.width * imageBitmap.height * TEXTURE_BYTES_PER_PIXEL;
    let texture: WebGLTexture;
    try {
      texture = this.host.createTexture(imageBitmap);
    } catch (error) {
      console.warn(`Failed to upload tile texture: ${key}`, error);
      if (loadingInfo) {
        this.requestRuntime.markFailed(key);
      }
      return;
    } finally {
      imageBitmap.close();
    }

    const { x, y } = parseTileKey(key);
    const tileInfo: TileInfo = {
      x,
      y,
      lodLevel,
      texture,
      lastUsed: performance.now(),
      isLoading: false,
      priority: loadingInfo
        ? loadingInfo.priority
        : tileInfoInCache
          ? tileInfoInCache.priority
          : 0,
      byteSize,
    };
    // 上下文丢失时 reset() 清空 requestRuntime 但 worker 仍存活，恢复后重发的
    // 请求可能与迟到的旧响应对同一 key 各产出一张纹理；覆盖前必须删旧纹理，
    // 否则它脱离缓存后 cleanup/disposeAll 都遍历不到，泄漏到上下文销毁为止。
    if (tileInfoInCache?.texture) {
      this.host.deleteTexture(tileInfoInCache.texture);
    }
    this.cache.set(key, tileInfo);

    if (loadingInfo) {
      this.requestRuntime.markLoaded(key);
    }

    this.cleanupOldTiles();
    this.host.requestRender();
    this.notifyIfVisibleLodReady();
  }

  // ---- Cache update / dispatch ---------------------------------------------

  updateTileCache(): void {
    if (this.disposed) return;
    this.lastUpdateTime = performance.now();

    const viewport = this.host.getViewport();
    const lodLevel = this.host.getSelectedLodLevel();

    // 底图分辨率已 ≥ 该 LOD 的输出分辨率（fit 视图是每张照片的默认状态）：
    // 瓦片只会重复底图内容。清空可见集、丢弃未派发请求，等缩放越过底图
    // 分辨率后瓦片才重新参与；已缓存纹理留给 cleanup 按容量/年龄回收。
    if (this.host.isLodCoveredByBase(lodLevel)) {
      this.visibleTiles = new Set();
      this.visibleLodLevel = -1;
      this.lastViewportHash = "";
      this.requestRuntime.pruneInvisiblePending(this.visibleTiles);
      this.cleanupOldTiles();
      // 只画底图了：onVisibleLodReady 不会再触发，需显式让引擎把质量降回底图水平。
      this.host.onCoveredByBase?.();
      return;
    }

    const visibleTiles = calculateVisibleTiles({ ...viewport, lodLevel });
    const newVisibleTiles = new Set<TileKey>();

    // 创建当前视口的哈希，用于检测视口变化
    const viewportHash = createViewportHash(viewport);
    const viewportChanged = viewportHash !== this.lastViewportHash;
    this.lastViewportHash = viewportHash;

    let addedNewRequest = false;

    // 标记需要的瓦片
    for (const tile of visibleTiles) {
      const key = createTileKey(tile.x, tile.y, tile.lodLevel);
      newVisibleTiles.add(key);

      addedNewRequest =
        this.requestRuntime.queueVisibleTile({
          hasCachedTile: this.cache.has(key),
          key,
          priority: tile.priority,
        }) || addedNewRequest;

      const cachedTile = this.cache.get(key);
      if (cachedTile) {
        // 更新使用时间
        cachedTile.lastUsed = performance.now();
      }
    }

    this.visibleTiles = newVisibleTiles;
    this.visibleLodLevel = lodLevel;
    // 丢弃已不可见但尚未派发的瓦片请求，避免把过期瓦片排到可见瓦片之前。
    this.requestRuntime.pruneInvisiblePending(newVisibleTiles);
    this.cleanupOldTiles();

    if (
      viewportChanged ||
      addedNewRequest ||
      this.requestRuntime.hasPendingWork
    ) {
      this.processPendingTileRequests();
    }

    this.notifyIfVisibleLodReady();
  }

  private cleanupOldTiles(): void {
    cleanupTileTextures({
      currentVisibleTiles: this.visibleTiles,
      deleteTexture: (texture) => this.host.deleteTexture(texture),
      maxCacheBytes: TILE_CACHE_BYTE_BUDGET,
      maxCacheSize: TILE_CACHE_SIZE,
      now: performance.now(),
      tileCache: this.cache,
    });
  }

  private processPendingTileRequests(): void {
    if (this.disposed || !this.host.canDispatchTiles()) return;

    if (!this.requestRuntime.hasPendingWork) {
      if (this.processingFrameId !== null) {
        cancelAnimationFrame(this.processingFrameId);
        this.processingFrameId = null;
      }
      return;
    }

    const { imageWidth, imageHeight } = this.host.getViewport();
    const batch = this.requestRuntime.selectBatch(MAX_TILES_PER_FRAME);

    for (const request of batch) {
      const { key } = request;

      if (this.cache.has(key)) {
        this.requestRuntime.markLoaded(key);
        continue;
      }

      // 解析瓦片坐标
      const { x, y, lodLevel } = parseTileKey(key);

      try {
        this.host.requestTileFromWorker({
          x,
          y,
          lodLevel,
          imageWidth,
          imageHeight,
          key,
        });
      } catch (error) {
        console.warn(`Failed to dispatch tile request: ${key}`, error);
        this.requestRuntime.markFailed(key);
      }
    }

    if (this.requestRuntime.hasPendingWork && this.processingFrameId === null) {
      this.processingFrameId = requestAnimationFrame(() => {
        this.processingFrameId = null;
        this.processPendingTileRequests();
      });
    }
  }

  // ---- Render support --------------------------------------------------------

  /**
   * Textures + matrices for every visible tile cached at `lodLevel`, ready for
   * the engine's draw loop.
   */
  collectVisibleRenderTiles(
    lodLevel: number,
  ): Array<{ texture: WebGLTexture; matrix: Float32Array }> {
    const viewport = this.host.getViewport();
    const result: Array<{ texture: WebGLTexture; matrix: Float32Array }> = [];

    for (const key of this.visibleTiles) {
      const tileInfo = this.cache.get(key);
      if (!tileInfo || !tileInfo.texture || tileInfo.lodLevel !== lodLevel) {
        continue;
      }

      result.push({
        texture: tileInfo.texture,
        matrix: createTileMatrix({
          tileX: tileInfo.x,
          tileY: tileInfo.y,
          lodLevel: tileInfo.lodLevel,
          canvasWidth: viewport.canvasWidth,
          canvasHeight: viewport.canvasHeight,
          imageWidth: viewport.imageWidth,
          imageHeight: viewport.imageHeight,
          scale: viewport.scale,
          translateX: viewport.translateX,
          translateY: viewport.translateY,
        }),
      });
    }

    return result;
  }

  /**
   * Called from the render loop: schedule a trailing tile-cache update. At
   * most one update runs per TILE_UPDATE_DEBOUNCE_MS window, but every render
   * is guaranteed a trailing update — inside the window the timeout is set to
   * the remaining delay instead of being dropped, so a fast flick that ends
   * mid-window still refreshes the visible tile set. The timeout (never less
   * than zero delay) also keeps the update off the render stack.
   */
  maybeScheduleUpdate(isAnimating: boolean): void {
    if (this.disposed || isAnimating) return;
    if (this.updateTimeoutId !== null) return;

    const elapsed = performance.now() - this.lastUpdateTime;
    this.updateTimeoutId = setTimeout(
      () => {
        this.updateTimeoutId = null;
        this.updateTileCache();
      },
      Math.max(0, TILE_UPDATE_DEBOUNCE_MS - elapsed),
    );
  }

  // ---- Quality reporting -----------------------------------------------------

  private notifyIfVisibleLodReady(): void {
    if (this.visibleTiles.size === 0 || this.visibleLodLevel < 0) return;

    for (const key of this.visibleTiles) {
      const tileInfo = this.cache.get(key);
      if (!tileInfo || !tileInfo.texture) return;
    }

    this.host.onVisibleLodReady(this.visibleLodLevel);
  }

  // ---- Lifecycle -------------------------------------------------------------

  private cancelScheduledWork(): void {
    if (this.processingFrameId !== null) {
      cancelAnimationFrame(this.processingFrameId);
      this.processingFrameId = null;
    }
    if (this.updateTimeoutId !== null) {
      clearTimeout(this.updateTimeoutId);
      this.updateTimeoutId = null;
    }
  }

  /**
   * Context loss: the GPU textures died with the context, so drop bookkeeping
   * only — no per-texture deletes — and stop any queued dispatch work so a
   * restore starts clean.
   */
  reset(): void {
    this.cancelScheduledWork();
    this.cache.clear();
    this.requestRuntime.clear();
    this.visibleTiles = new Set();
    this.visibleLodLevel = -1;
    this.lastViewportHash = "";
  }

  /**
   * Engine teardown: cancel scheduled work and delete every cached tile
   * texture.
   * 释放所有瓦片纹理，避免复用同一 canvas/context 时 GPU 显存随换图累积泄漏。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelScheduledWork();
    disposeAllTileTextures({
      deleteTexture: (texture) => this.host.deleteTexture(texture),
      tileCache: this.cache,
    });
    this.requestRuntime.clear();
    this.visibleTiles = new Set();
  }
}
