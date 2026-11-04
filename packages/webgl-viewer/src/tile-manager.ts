import type { TileInfo, TileKey } from "./tile-cache";
import {
  createTileKey,
  getTileGridSize,
  MAX_TILES_IN_FLIGHT,
  MAX_TILES_PER_FRAME,
  parseTileKey,
  TEXTURE_BYTES_PER_PIXEL,
  TILE_CACHE_BYTE_BUDGET,
  TILE_CACHE_SIZE,
  TILE_UPLOAD_BYTE_BUDGET,
  TILE_UPLOAD_TIME_BUDGET_MS,
} from "./tile-cache";
import type { LoadingTileInfo } from "./tile-request-runtime";
import { TileRequestRuntime } from "./tile-request-runtime";
import type { TileBudget } from "./tile-scheduler";
import { createViewportHash, planTilesWithinBudget } from "./tile-scheduler";
import {
  cleanupTileTextures,
  disposeAllTileTextures,
  reserveTileTextureSpace,
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

interface PendingTileUpload {
  key: TileKey;
  imageBitmap: ImageBitmap;
  lodLevel: number;
  byteSize: number;
}

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
   * The base is the guaranteed quality while tiles are absent or the current
   * visible set is incomplete. Prefetch never delays visible readiness.
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
  private readonly pendingUploads = new Map<TileKey, PendingTileUpload>();
  private visibleTiles = new Set<TileKey>();
  /** Visible tiles plus the prefetch border admitted by the current budget. */
  private admittedTiles = new Set<TileKey>();
  /** LOD level the current visible set was computed for. */
  private visibleLodLevel = -1;
  private lastViewportHash = "";
  private processingFrameId: number | null = null;
  private processingGeneration = 0;
  private updateTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastUpdateTime = 0;
  private disposed = false;

  constructor(
    private readonly host: TileManagerHost,
    private readonly budget: TileBudget = {
      maxCacheBytes: TILE_CACHE_BYTE_BUDGET,
      maxCacheSize: TILE_CACHE_SIZE,
    },
  ) {}

  // ---- Read-only views for the debug overlay -------------------------------

  get tileCache(): ReadonlyMap<TileKey, TileInfo> {
    return this.cache;
  }

  get currentVisibleTiles(): ReadonlySet<TileKey> {
    return this.visibleTiles;
  }

  /** Effective detail only becomes current once every visible tile is ready. */
  get currentReadyLodLevel(): number | null {
    if (this.visibleTiles.size === 0 || this.visibleLodLevel < 0) return null;
    for (const key of this.visibleTiles) {
      if (!this.cache.get(key)?.texture) return null;
    }
    return this.visibleLodLevel;
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
      if (!this.pendingUploads.has(key)) this.requestRuntime.markFailed(key);
      this.scheduleProcessingFrame();
      return true;
    }

    return false;
  }

  private handleTileCreated(payload: {
    key: TileKey;
    imageBitmap: ImageBitmap;
    lodLevel: number;
  }): void {
    const { key, imageBitmap } = payload;

    if (this.disposed) {
      imageBitmap.close();
      return;
    }

    const loadingInfo = this.requestRuntime.getLoadingInfo(key);
    // A queued reply still owns its dispatch slot. Duplicate replies must not
    // release it while the first bitmap is waiting to reach the GPU.
    if (!loadingInfo || this.pendingUploads.has(key)) {
      imageBitmap.close();
      return;
    }
    if (!this.admittedTiles.has(key) || this.cache.has(key)) {
      imageBitmap.close();
      this.requestRuntime.markLoaded(key);
      this.scheduleProcessingFrame();
      return;
    }

    const byteSize =
      imageBitmap.width * imageBitmap.height * TEXTURE_BYTES_PER_PIXEL;
    if (
      !Number.isFinite(byteSize) ||
      byteSize <= 0 ||
      byteSize > Math.min(this.budget.maxCacheBytes, TILE_UPLOAD_BYTE_BUDGET)
    ) {
      imageBitmap.close();
      this.requestRuntime.markFailed(key);
      this.scheduleProcessingFrame();
      return;
    }
    this.pendingUploads.set(key, { ...payload, byteSize });
    this.scheduleProcessingFrame();
  }

  /** Called only at a frame boundary, never for each arriving worker message. */
  private uploadTile({
    key,
    imageBitmap,
    lodLevel,
    byteSize,
  }: PendingTileUpload): boolean {
    const loadingInfo = this.requestRuntime.getLoadingInfo(key);
    if (
      !reserveTileTextureSpace({
        byteSize,
        currentVisibleTiles: this.visibleTiles,
        admittedTiles: this.admittedTiles,
        deleteTexture: this.host.deleteTexture,
        ...this.budget,
        tileCache: this.cache,
      })
    ) {
      imageBitmap.close();
      this.requestRuntime.markFailed(key);
      return false;
    }
    let texture: WebGLTexture;
    try {
      texture = this.host.createTexture(imageBitmap);
    } catch (error) {
      console.warn(`Failed to upload tile texture: ${key}`, error);
      this.requestRuntime.markFailed(key);
      return false;
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
      priority: loadingInfo?.priority ?? 0,
      byteSize,
    };
    this.cache.set(key, tileInfo);

    this.requestRuntime.markLoaded(key);
    return this.visibleTiles.has(key);
  }

  // ---- Cache update / dispatch ---------------------------------------------

  updateTileCache(): void {
    if (this.disposed) return;
    this.lastUpdateTime = performance.now();

    const viewport = this.host.getViewport();
    const plan = planTilesWithinBudget(
      { ...viewport, lodLevel: this.host.getSelectedLodLevel() },
      this.budget,
      this.host.isLodCoveredByBase,
    );
    const { lodLevel } = plan;

    // 底图已覆盖所需分辨率，或者可见瓦片在所有 LOD 下都超出预算：
    // 清空可见集、丢弃未派发请求；已缓存纹理留给容量/年龄回收。
    if (lodLevel === null) {
      const changed = this.visibleTiles.size > 0;
      this.visibleTiles = new Set();
      this.admittedTiles = new Set();
      this.visibleLodLevel = -1;
      this.lastViewportHash = "";
      this.requestRuntime.pruneInvisiblePending(this.visibleTiles);
      this.prunePendingUploads();
      this.cleanupOldTiles();
      // 只画底图了：onVisibleLodReady 不会再触发，需显式让引擎把质量降回底图水平。
      if (viewport.imageLoaded) this.host.onCoveredByBase?.();
      if (changed) this.host.requestRender();
      return;
    }

    const newVisibleTiles = new Set(
      plan.visibleTiles.map((tile) =>
        createTileKey(tile.x, tile.y, tile.lodLevel),
      ),
    );
    const planChanged =
      lodLevel !== this.visibleLodLevel ||
      newVisibleTiles.size !== this.visibleTiles.size ||
      [...newVisibleTiles].some((key) => !this.visibleTiles.has(key));
    const newAdmittedTiles = new Set<TileKey>();

    // 创建当前视口的哈希，用于检测视口变化
    const viewportHash = createViewportHash(viewport);
    const viewportChanged = viewportHash !== this.lastViewportHash;
    this.lastViewportHash = viewportHash;

    let addedNewRequest = false;

    // 标记需要的瓦片
    // Rank visible tiles ahead of ALL prefetch, including after a quick pan.
    for (const [priority, tile] of [
      ...plan.visibleTiles,
      ...plan.prefetchTiles,
    ].entries()) {
      const key = createTileKey(tile.x, tile.y, tile.lodLevel);
      newAdmittedTiles.add(key);

      addedNewRequest =
        this.requestRuntime.queueVisibleTile({
          hasCachedTile: this.cache.has(key),
          key,
          priority,
        }) || addedNewRequest;

      const cachedTile = this.cache.get(key);
      if (cachedTile) {
        // 更新使用时间
        cachedTile.lastUsed = performance.now();
      }
    }

    this.visibleTiles = newVisibleTiles;
    this.admittedTiles = newAdmittedTiles;
    this.visibleLodLevel = lodLevel;
    // 丢弃已不可见但尚未派发的瓦片请求，避免把过期瓦片排到可见瓦片之前。
    this.requestRuntime.pruneInvisiblePending(newAdmittedTiles);
    this.prunePendingUploads();
    this.cleanupOldTiles();

    if (
      viewportChanged ||
      addedNewRequest ||
      this.requestRuntime.hasPendingWork ||
      this.pendingUploads.size > 0
    ) {
      if (this.processingFrameId === null) this.dispatchPendingTileRequests();
      this.scheduleProcessingFrame();
    }

    this.notifyIfVisibleLodReady();
    if (planChanged) this.host.requestRender();
  }

  private cleanupOldTiles(): void {
    cleanupTileTextures({
      currentVisibleTiles: this.admittedTiles,
      deleteTexture: (texture) => this.host.deleteTexture(texture),
      ...this.budget,
      now: performance.now(),
      tileCache: this.cache,
    });
  }

  private dispatchPendingTileRequests(): void {
    if (this.disposed || !this.host.canDispatchTiles()) return;
    const availableSlots =
      MAX_TILES_IN_FLIGHT - this.requestRuntime.loadingTiles.size;
    if (!this.requestRuntime.hasPendingWork || availableSlots <= 0) return;

    const { imageWidth, imageHeight } = this.host.getViewport();
    const batch = this.requestRuntime.selectBatch(
      Math.min(MAX_TILES_PER_FRAME, availableSlots),
    );

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
  }

  private prunePendingUploads(): void {
    for (const [key, pending] of this.pendingUploads) {
      if (this.admittedTiles.has(key)) continue;
      pending.imageBitmap.close();
      this.pendingUploads.delete(key);
      this.requestRuntime.markLoaded(key);
    }
  }

  private scheduleProcessingFrame(): void {
    if (
      this.disposed ||
      !this.host.canDispatchTiles() ||
      this.processingFrameId !== null
    )
      return;
    const canDispatch =
      this.requestRuntime.hasPendingWork &&
      this.requestRuntime.loadingTiles.size < MAX_TILES_IN_FLIGHT;
    if (this.pendingUploads.size === 0 && !canDispatch) return;
    const { processingGeneration: generation } = this;
    this.processingFrameId = requestAnimationFrame(() => {
      if (generation !== this.processingGeneration) return;
      this.processingFrameId = null;
      if (this.disposed || !this.host.canDispatchTiles()) return;
      this.uploadPendingTiles();
      this.dispatchPendingTileRequests();
      this.scheduleProcessingFrame();
    });
  }

  private uploadPendingTiles(): void {
    // Newly visible tiles outrank an old viewport's prefetch replies.
    const pending = [...this.pendingUploads.values()].sort(
      (a, b) =>
        Number(this.visibleTiles.has(b.key)) -
        Number(this.visibleTiles.has(a.key)),
    );
    const startedAt = performance.now();
    let uploadedCount = 0;
    let uploadedBytes = 0;
    let visibleChanged = false;
    for (const tile of pending) {
      if (this.disposed || !this.host.canDispatchTiles()) break;
      if (!this.pendingUploads.has(tile.key)) continue;
      if (
        uploadedCount >= MAX_TILES_PER_FRAME ||
        uploadedBytes + tile.byteSize > TILE_UPLOAD_BYTE_BUDGET ||
        (uploadedCount > 0 &&
          performance.now() - startedAt >= TILE_UPLOAD_TIME_BUDGET_MS)
      )
        break;
      this.pendingUploads.delete(tile.key);
      visibleChanged = this.uploadTile(tile) || visibleChanged;
      uploadedCount++;
      uploadedBytes += tile.byteSize;
    }
    if (visibleChanged) {
      this.notifyIfVisibleLodReady();
      this.host.requestRender();
    }
  }

  // ---- Render support --------------------------------------------------------

  /**
   * Textures + matrices at the budget-selected LOD, ready for the draw loop.
   */
  collectVisibleRenderTiles(): Array<{
    texture: WebGLTexture;
    matrix: Float32Array;
  }> {
    const viewport = this.host.getViewport();
    const result: Array<{ texture: WebGLTexture; matrix: Float32Array }> = [];

    for (const key of this.visibleTiles) {
      const tileInfo = this.cache.get(key);
      if (
        !tileInfo ||
        !tileInfo.texture ||
        tileInfo.lodLevel !== this.visibleLodLevel
      ) {
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
    const readyLodLevel = this.currentReadyLodLevel;
    if (readyLodLevel === null) this.host.onCoveredByBase?.();
    else this.host.onVisibleLodReady(readyLodLevel);
  }

  // ---- Lifecycle -------------------------------------------------------------

  private cancelScheduledWork(): void {
    this.processingGeneration++;
    if (this.processingFrameId !== null) {
      cancelAnimationFrame(this.processingFrameId);
      this.processingFrameId = null;
    }
    if (this.updateTimeoutId !== null) {
      clearTimeout(this.updateTimeoutId);
      this.updateTimeoutId = null;
    }
    for (const pending of this.pendingUploads.values())
      pending.imageBitmap.close();
    this.pendingUploads.clear();
  }

  /**
   * Context loss: the GPU textures died with the context, so drop bookkeeping
   * only — no per-texture deletes — and stop any queued dispatch work so a
   * restore starts clean. Normal image reloads explicitly release live textures.
   */
  reset({ releaseTextures = false }: { releaseTextures?: boolean } = {}): void {
    this.cancelScheduledWork();
    if (releaseTextures) {
      disposeAllTileTextures({
        deleteTexture: this.host.deleteTexture,
        tileCache: this.cache,
      });
    } else {
      this.cache.clear();
    }
    this.requestRuntime.clear();
    this.visibleTiles = new Set();
    this.admittedTiles = new Set();
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
    this.admittedTiles = new Set();
    this.visibleLodLevel = -1;
  }
}
