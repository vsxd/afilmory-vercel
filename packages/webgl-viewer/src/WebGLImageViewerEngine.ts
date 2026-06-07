import { TransformAnimationController } from "./animation-controller";
import { copyImageUrlToClipboard } from "./clipboard-service";
import { createWebGLDebugInfo } from "./debug-adapter";
import { resolveDoubleClickToggle } from "./double-click-zoom-policy";
import { LoadingState } from "./enum";
import { ImageViewerEngineBase } from "./ImageViewerEngineBase";
import { WebGLInputController } from "./input-controller";
import type { DebugInfo, WebGLImageViewerProps } from "./interface";
import { WebGLViewerRenderer } from "./renderer";
import { getLodQuality, TextureLodManager } from "./texture-lod-manager";
import type { TileInfo, TileKey } from "./tile-cache";
import {
  createTileKey,
  getTileGridSize as getTileGridSizeForLOD,
  MAX_TILES_PER_FRAME,
  SIMPLE_LOD_LEVELS,
  TILE_CACHE_SIZE,
} from "./tile-cache";
import { TileRequestRuntime } from "./tile-request-runtime";
import {
  calculateVisibleTiles as calculateVisibleTilesForViewport,
  createViewportHash,
} from "./tile-scheduler";
import { cleanupTileTextures } from "./tile-texture-cleanup";
import type {
  TransformBounds,
  TransformState,
  ViewportGeometry,
} from "./transform-controller";
import {
  constrainImagePosition as constrainTransformPosition,
  constrainScaleAndPosition as constrainTransformScaleAndPosition,
  createFitTransform,
  getFitToScreenScale as getFitToScreenScaleForGeometry,
  zoomAtTransform,
} from "./transform-controller";
import { TextureWorkerBridge } from "./worker-bridge";

// 简化的 WebGL 图像查看器引擎
export class WebGLImageViewerEngine extends ImageViewerEngineBase {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private renderer!: WebGLViewerRenderer;
  private textureManager!: TextureLodManager;
  private imageLoaded = false;
  private originalImageSrc = "";

  // 变换状态
  private scale = 1;
  private translateX = 0;
  private translateY = 0;
  private imageWidth = 0;
  private imageHeight = 0;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private devicePixelRatio = 1;
  private isDoubleClickZoomed = false;

  // 动画状态
  private isDestroyed = false;
  private animationFrameId: number | null = null;
  private tileUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly animationController = new TransformAnimationController();

  // 简化的纹理管理
  // 配置和回调
  private config: Required<WebGLImageViewerProps>;
  private onZoomChange?: (originalScale: number, relativeScale: number) => void;
  private onImageCopied?: () => void;
  private onLoadingStateChange?: (
    isLoading: boolean,
    state?: LoadingState,
    quality?: "high" | "medium" | "low" | "unknown",
  ) => void;
  private onImagePainted?: () => void;
  private onDebugUpdate?: React.RefObject<(debugInfo: DebugInfo) => void>;
  private inputController: WebGLInputController | null = null;

  // 当前质量状态
  private currentQuality: "high" | "medium" | "low" | "unknown" = "unknown";
  private isLoadingTexture = true;
  private workerBridge: TextureWorkerBridge | null = null;
  private textureWorkerInitialized = false;
  private tileOutlineEnabled = false;

  private boundResizeCanvas: () => void;

  // 瓦片系统
  private tileCache = new Map<TileKey, TileInfo>();
  private tileRequestRuntime = new TileRequestRuntime();
  private tileProcessingFrameId: number | null = null;

  // Reusable buffers
  private matrixBuffer = new Float32Array(9);
  private tileMatrixBuffer = new Float32Array(9);

  // 可视区域信息
  private currentVisibleTiles = new Set<TileKey>();
  private lastViewportHash = "";

  // Promise resolvers for loadImage
  private loadImageResolve: (() => void) | null = null;
  private loadImageReject: ((error: Error) => void) | null = null;
  private hasNotifiedImagePainted = false;

  constructor(
    canvas: HTMLCanvasElement,
    config: Required<WebGLImageViewerProps>,
    onDebugUpdate?: React.RefObject<(debugInfo: DebugInfo) => void>,
  ) {
    super();
    this.canvas = canvas;
    this.config = config;
    this.onZoomChange = config.onZoomChange;
    this.onImageCopied = config.onImageCopied;
    this.onLoadingStateChange = config.onLoadingStateChange;
    this.onImagePainted = config.onImagePainted;
    this.onDebugUpdate = onDebugUpdate;

    // 初始化 WebGL
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      powerPreference: "default",
    });
    if (!gl) {
      throw new Error("WebGL not supported");
    }
    this.gl = gl;
    this.textureManager = new TextureLodManager(gl);

    this.boundResizeCanvas = () => this.resizeCanvas();

    this.setupCanvas();
    this.initWebGL();
    this.initWorker();
    this.setupEventListeners();

    this.isLoadingTexture = false;
    this.notifyLoadingStateChange(false);
  }

  private resizeObserver: ResizeObserver | null = null;

  private setupCanvas() {
    this.resizeCanvas();
    window.addEventListener("resize", this.boundResizeCanvas);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.resizeObserver = new ResizeObserver((e) => {
      if (e[0].target !== this.canvas) return;
      this.boundResizeCanvas();
    });
    this.resizeObserver.observe(this.canvas);
  }

  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.devicePixelRatio = window.devicePixelRatio || 1;

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;

    const actualWidth = Math.round(rect.width * this.devicePixelRatio);
    const actualHeight = Math.round(rect.height * this.devicePixelRatio);

    this.canvas.width = actualWidth;
    this.canvas.height = actualHeight;
    this.gl.viewport(0, 0, actualWidth, actualHeight);

    if (this.imageLoaded) {
      this.constrainScaleAndPosition();
      this.render();
      this.notifyZoomChange();
    }
  }

  private initWebGL() {
    this.renderer = new WebGLViewerRenderer(this.gl);
  }

  private initWorker() {
    this.workerBridge = new TextureWorkerBridge({
      onMessage: (event) => this.handleWorkerMessage(event),
    });
  }

  private handleWorkerMessage(e: MessageEvent) {
    if (this.isDestroyed) return;

    const { type, payload } = e.data;

    if (type === "image-loaded") {
      const { imageBitmap, imageWidth, imageHeight, lodLevel } = payload;
      try {
        if (!this.imageWidth || !this.imageHeight) {
          this.imageWidth = imageWidth;
          this.imageHeight = imageHeight;
          this.setupInitialScaling();
        }

        this.notifyLoadingStateChange(true, LoadingState.CREATE_TEXTURE);

        const texture = this.createWebGLTexture(imageBitmap);
        imageBitmap.close();

        if (texture) {
          this.textureManager.setBaseTexture(texture, lodLevel);
          this.currentQuality = getLodQuality(lodLevel);
        }

        this.imageLoaded = true;
        this.isLoadingTexture = false;
        this.notifyLoadingStateChange(false);
        this.render();
        this.notifyZoomChange();
        if (this.loadImageResolve) {
          this.loadImageResolve();
        }
      } catch (error) {
        if (this.loadImageReject) {
          this.loadImageReject(error as Error);
        }
      }
      return;
    }

    if (type === "load-error") {
      this.isLoadingTexture = false;
      this.notifyLoadingStateChange(false);
      if (this.loadImageReject) {
        this.loadImageReject(new Error("Failed to load image in worker"));
      }
      return;
    }

    if (type === "init-done") {
      this.textureWorkerInitialized = true;
      // After worker is initialized, we can start processing pending tiles.
      this.updateTileCache();
      return;
    }

    if (type === "tile-created") {
      const { key, imageBitmap, lodLevel } = payload;
      const loadingInfo = this.tileRequestRuntime.getLoadingInfo(key);
      const tileInfoInCache = this.tileCache.get(key);

      // Tile might have been loaded by other means or is no longer needed
      if (!this.currentVisibleTiles.has(key)) {
        imageBitmap.close();
        if (loadingInfo) {
          this.tileRequestRuntime.markLoaded(key);
        }
        return;
      }

      const texture = this.createWebGLTexture(imageBitmap);
      imageBitmap.close(); // free memory

      if (texture) {
        const [x, y] = key.split("-").map(Number);
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
        };
        this.tileCache.set(key, tileInfo);

        if (loadingInfo) {
          this.tileRequestRuntime.markLoaded(key);
        }

        if (this.currentVisibleTiles.has(key)) {
          this.render();
        }
      } else if (loadingInfo) {
        this.tileRequestRuntime.markFailed(key);
      }
    } else if (type === "tile-error") {
      const { key, error } = payload;
      console.warn(`Worker failed to create tile: ${key}`, error);
      this.tileRequestRuntime.markFailed(key);
    }
  }

  async loadImage(
    url: string,
    preknownWidth?: number,
    preknownHeight?: number,
    sourceBlob?: Blob | null,
  ) {
    if (this.isDestroyed) {
      throw new Error("WebGL image viewer has been destroyed");
    }

    this.hasNotifiedImagePainted = false;
    this.originalImageSrc = url;
    this.isLoadingTexture = true;
    this.notifyLoadingStateChange(true, LoadingState.IMAGE_LOADING);

    if (preknownWidth && preknownHeight) {
      this.imageWidth = preknownWidth;
      this.imageHeight = preknownHeight;
      this.setupInitialScaling();
    }

    return new Promise<void>((resolve, reject) => {
      this.loadImageResolve = resolve;
      this.loadImageReject = reject;

      this.workerBridge?.loadImage({
        url,
        blob: sourceBlob ?? null,
      });
    });
  }

  private setupInitialScaling() {
    if (this.config.centerOnInit) {
      this.fitImageToScreen();
    } else {
      const fitToScreenScale = this.getFitToScreenScale();
      this.scale = fitToScreenScale * this.config.initialScale;
    }
  }

  private createWebGLTexture(
    source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): WebGLTexture | null {
    return this.renderer.createTexture(source);
  }

  private selectOptimalLOD(): number {
    if (
      this.animationController.isAnimating &&
      this.animationController.startLOD > -1
    ) {
      return this.animationController.startLOD;
    }
    if (!this.imageLoaded) return 1;

    const requiredScale = this.scale * this.devicePixelRatio;

    // 寻找最佳的 LOD 级别
    // 我们希望找到一个 LOD 级别，它的缩放比例刚好大于或等于所需的缩放比例
    for (const [i, SIMPLE_LOD_LEVEL] of SIMPLE_LOD_LEVELS.entries()) {
      if (SIMPLE_LOD_LEVEL.scale >= requiredScale) {
        return i;
      }
    }

    // 如果没有找到，返回最高质量的 LOD
    return SIMPLE_LOD_LEVELS.length - 1;
  }

  private startAnimation(
    targetScale: number,
    targetTranslateX: number,
    targetTranslateY: number,
    animationTime?: number,
  ) {
    const startTransform = this.getTransformState();
    const startLOD = this.selectOptimalLOD();

    // 约束目标位置
    const tempScale = this.scale;
    const tempTranslateX = this.translateX;
    const tempTranslateY = this.translateY;

    this.scale = targetScale;
    this.translateX = targetTranslateX;
    this.translateY = targetTranslateY;
    this.constrainImagePosition();

    const targetTransform = this.getTransformState();

    // 恢复当前状态
    this.scale = tempScale;
    this.translateX = tempTranslateX;
    this.translateY = tempTranslateY;

    this.animationController.start({
      duration: animationTime || (this.config.smooth ? 300 : 0),
      from: startTransform,
      startLOD,
      startTime: performance.now(),
      to: targetTransform,
    });
    this.animate();
  }

  private animate() {
    if (this.isDestroyed || !this.animationController.isAnimating) return;

    const step = this.animationController.step(
      performance.now(),
      this.config.smooth,
    );
    if (!step) return;

    this.applyTransformState(step.transform);
    this.render();
    this.notifyZoomChange();

    if (!step.done) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null;
        this.animate();
      });
    } else {
      this.render();
      this.notifyZoomChange();
      // 动画结束后，立即更新瓦片
      this.updateTileCache();
    }
  }

  private fitImageToScreen() {
    this.applyTransformState(
      createFitTransform(this.getViewportGeometry(), this.config.initialScale),
    );
    this.isDoubleClickZoomed = false;
  }

  private createMatrix(): Float32Array {
    const scaleX = (this.imageWidth * this.scale) / this.canvasWidth;
    const scaleY = (this.imageHeight * this.scale) / this.canvasHeight;
    const translateX = (this.translateX * 2) / this.canvasWidth;
    const translateY = -(this.translateY * 2) / this.canvasHeight;

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

  private getViewportGeometry(): ViewportGeometry {
    return {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
    };
  }

  private getTransformState(): TransformState {
    return {
      scale: this.scale,
      translateX: this.translateX,
      translateY: this.translateY,
    };
  }

  private getTransformBounds(): TransformBounds {
    return {
      initialScale: this.config.initialScale,
      limitToBounds: this.config.limitToBounds,
      maxScale: this.config.maxScale,
      minScale: this.config.minScale,
    };
  }

  private applyTransformState(transform: TransformState): void {
    this.scale = transform.scale;
    this.translateX = transform.translateX;
    this.translateY = transform.translateY;
  }

  private getFitToScreenScale(): number {
    return getFitToScreenScaleForGeometry(this.getViewportGeometry());
  }

  private constrainImagePosition() {
    this.applyTransformState(
      constrainTransformPosition(
        this.getTransformState(),
        this.getViewportGeometry(),
        this.config.limitToBounds,
      ),
    );
  }

  private constrainScaleAndPosition() {
    this.applyTransformState(
      constrainTransformScaleAndPosition(
        this.getTransformState(),
        this.getViewportGeometry(),
        this.getTransformBounds(),
      ),
    );
  }

  // 瓦片系统实现
  private getTileKey(x: number, y: number, lodLevel: number): TileKey {
    return createTileKey(x, y, lodLevel);
  }

  private getTileGridSize(lodLevel: number): { cols: number; rows: number } {
    return getTileGridSizeForLOD({
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      lodLevel,
    });
  }

  private calculateVisibleTiles(): Array<{
    x: number;
    y: number;
    lodLevel: number;
    priority: number;
  }> {
    return calculateVisibleTilesForViewport({
      ...this.getViewportGeometry(),
      imageLoaded: this.imageLoaded,
      lodLevel: this.selectOptimalLOD(),
      scale: this.scale,
      translateX: this.translateX,
      translateY: this.translateY,
    });
  }

  private async updateTileCache(): Promise<void> {
    if (this.isDestroyed) return;

    const visibleTiles = this.calculateVisibleTiles();
    const newVisibleTiles = new Set<TileKey>();

    // 创建当前视口的哈希，用于检测视口变化
    const viewportHash = createViewportHash({
      scale: this.scale,
      translateX: this.translateX,
      translateY: this.translateY,
    });
    const viewportChanged = viewportHash !== this.lastViewportHash;
    this.lastViewportHash = viewportHash;

    let addedNewRequest = false;

    // 标记需要的瓦片
    for (const tile of visibleTiles) {
      const key = this.getTileKey(tile.x, tile.y, tile.lodLevel);
      newVisibleTiles.add(key);

      addedNewRequest =
        this.tileRequestRuntime.queueVisibleTile({
          hasCachedTile: this.tileCache.has(key),
          key,
          priority: tile.priority,
        }) || addedNewRequest;

      if (this.tileCache.has(key)) {
        // 更新使用时间
        const tileInfo = this.tileCache.get(key)!;
        tileInfo.lastUsed = performance.now();
      }
    }

    this.currentVisibleTiles = newVisibleTiles;
    this.cleanupOldTiles();

    if (
      viewportChanged ||
      addedNewRequest ||
      this.tileRequestRuntime.hasPendingWork
    ) {
      this.processPendingTileRequests();
    }
  }

  private cleanupOldTiles(): void {
    cleanupTileTextures({
      currentVisibleTiles: this.currentVisibleTiles,
      deleteTexture: (texture) => this.gl.deleteTexture(texture),
      maxCacheSize: TILE_CACHE_SIZE,
      now: performance.now(),
      tileCache: this.tileCache,
    });
  }

  private processPendingTileRequests(): void {
    if (this.isDestroyed) return;

    if (!this.workerBridge || !this.textureWorkerInitialized) {
      return;
    }

    if (!this.tileRequestRuntime.hasPendingWork) {
      if (this.tileProcessingFrameId !== null) {
        cancelAnimationFrame(this.tileProcessingFrameId);
        this.tileProcessingFrameId = null;
      }
      return;
    }

    const batch = this.tileRequestRuntime.selectBatch(MAX_TILES_PER_FRAME);

    for (const request of batch) {
      const { key } = request;

      if (this.tileCache.has(key)) {
        this.tileRequestRuntime.markLoaded(key);
        continue;
      }

      // 解析瓦片坐标
      const [x, y, lodLevel] = key.split("-").map(Number);
      const lodConfig = SIMPLE_LOD_LEVELS[lodLevel];

      this.workerBridge.createTile({
        x,
        y,
        lodLevel,
        lodConfig,
        imageWidth: this.imageWidth,
        imageHeight: this.imageHeight,
        key,
      });
    }

    if (
      this.tileRequestRuntime.hasPendingWork &&
      this.tileProcessingFrameId === null
    ) {
      this.tileProcessingFrameId = requestAnimationFrame(() => {
        this.tileProcessingFrameId = null;
        this.processPendingTileRequests();
      });
    }
  }

  // 修改渲染方法以支持瓦片渲染
  private render() {
    if (this.isDestroyed) return;

    this.renderer.prepareFrame(this.canvas.width, this.canvas.height);

    // 始终渲染一个低分辨率的底图作为回退，防止瓦片加载过程中出现空白
    if (this.textureManager.texture) {
      this.renderer.drawTexturedQuad(
        this.textureManager.texture,
        this.createMatrix(),
      );
    }

    // 渲染可见的瓦片
    const lodLevel = this.selectOptimalLOD();
    const outlinedTileMatrices: Float32Array[] = [];

    for (const tileKey of this.currentVisibleTiles) {
      const tileInfo = this.tileCache.get(tileKey);
      if (!tileInfo || !tileInfo.texture || tileInfo.lodLevel !== lodLevel) {
        continue;
      }

      // 计算瓦片的渲染变换矩阵
      const tileMatrix = this.createTileMatrix(
        tileInfo.x,
        tileInfo.y,
        tileInfo.lodLevel,
      );
      this.renderer.drawTexturedQuad(tileInfo.texture, tileMatrix);
      if (this.tileOutlineEnabled) {
        outlinedTileMatrices.push(tileMatrix);
      }
    }

    this.renderer.drawTileOutlines(
      outlinedTileMatrices,
      this.tileOutlineEnabled,
    );
    this.notifyImagePainted();

    // 更新调试信息
    this.updateDebugInfo();

    // 定期更新瓦片缓存
    if (
      !this.animationController.isAnimating &&
      performance.now() - this.lastTileUpdateTime > 100
    ) {
      // 100ms 防抖
      this.lastTileUpdateTime = performance.now();
      if (this.tileUpdateTimeoutId === null) {
        this.tileUpdateTimeoutId = setTimeout(() => {
          this.tileUpdateTimeoutId = null;
          void this.updateTileCache();
        }, 0);
      }
    }
  }

  private notifyImagePainted() {
    if (
      this.hasNotifiedImagePainted ||
      !this.imageLoaded ||
      !this.textureManager.texture
    ) {
      return;
    }

    if (this.canvas.width === 0 || this.canvas.height === 0) {
      return;
    }

    this.hasNotifiedImagePainted = true;
    this.onImagePainted?.();
  }

  private createTileMatrix(
    tileX: number,
    tileY: number,
    lodLevel: number,
  ): Float32Array {
    const { cols, rows } = this.getTileGridSize(lodLevel);

    // 计算瓦片在原图中的区域
    const tileWidthInImage = this.imageWidth / cols;
    const tileHeightInImage = this.imageHeight / rows;

    // 瓦片在原图中的边界
    const tileLeftInImage = tileX * tileWidthInImage;
    const tileTopInImage = tileY * tileHeightInImage;
    const tileRightInImage = Math.min(
      this.imageWidth,
      tileLeftInImage + tileWidthInImage,
    );
    const tileBottomInImage = Math.min(
      this.imageHeight,
      tileTopInImage + tileHeightInImage,
    );

    // 瓦片的实际尺寸（处理边界情况）
    const actualTileWidth = tileRightInImage - tileLeftInImage;
    const actualTileHeight = tileBottomInImage - tileTopInImage;

    // 瓦片中心在原图中的位置
    const tileCenterInImageX = tileLeftInImage + actualTileWidth / 2;
    const tileCenterInImageY = tileTopInImage + actualTileHeight / 2;

    // 将瓦片中心转换到相对于图像中心的坐标
    const tileCenterRelativeX = tileCenterInImageX - this.imageWidth / 2;
    const tileCenterRelativeY = tileCenterInImageY - this.imageHeight / 2;

    // 计算瓦片在 canvas 中的位置
    const tileCenterInCanvasX =
      this.canvasWidth / 2 + this.translateX + tileCenterRelativeX * this.scale;
    const tileCenterInCanvasY =
      this.canvasHeight / 2 +
      this.translateY +
      tileCenterRelativeY * this.scale;

    // 计算瓦片在 canvas 中的尺寸
    const tileWidthInCanvas = actualTileWidth * this.scale;
    const tileHeightInCanvas = actualTileHeight * this.scale;

    // 转换到 WebGL 归一化坐标系 (-1 到 1)
    const scaleX = tileWidthInCanvas / this.canvasWidth;
    const scaleY = tileHeightInCanvas / this.canvasHeight;

    const translateX = (tileCenterInCanvasX * 2) / this.canvasWidth - 1;
    const translateY = -((tileCenterInCanvasY * 2) / this.canvasHeight - 1);

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

  // 添加瓦片更新时间追踪
  private lastTileUpdateTime = 0;

  // 公共方法
  public zoomIn(animated = false) {
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    this.zoomAt(centerX, centerY, 1 + this.config.wheel.step, animated);
  }

  public zoomOut(animated = false) {
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    this.zoomAt(centerX, centerY, 1 - this.config.wheel.step, animated);
  }

  public resetView() {
    const fitToScreenScale = this.getFitToScreenScale();
    const targetScale = fitToScreenScale * this.config.initialScale;
    this.startAnimation(targetScale, 0, 0);
  }

  public getScale(): number {
    return this.scale;
  }

  public setTileOutlineEnabled(enabled: boolean) {
    this.tileOutlineEnabled = enabled;
    this.render();
  }

  public isTileOutlineEnabled(): boolean {
    return this.tileOutlineEnabled;
  }

  public destroy() {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    this.animationController.cancel();

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.tileUpdateTimeoutId !== null) {
      clearTimeout(this.tileUpdateTimeoutId);
      this.tileUpdateTimeoutId = null;
    }

    window.removeEventListener("resize", this.boundResizeCanvas);
    this.inputController?.dispose();
    this.inputController = null;

    // 清理 WebGL 资源
    this.textureManager.dispose();
    this.renderer.dispose();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.tileProcessingFrameId !== null) {
      cancelAnimationFrame(this.tileProcessingFrameId);
      this.tileProcessingFrameId = null;
    }

    this.workerBridge?.dispose();
    this.workerBridge = null;
    this.tileRequestRuntime.clear();
  }

  private updateDebugInfo() {
    if (!this.onDebugUpdate?.current) return;

    const fitToScreenScale = this.getFitToScreenScale();
    const userMaxScale = fitToScreenScale * this.config.maxScale;
    const originalSizeScale = 1;
    const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale);

    this.onDebugUpdate.current(
      createWebGLDebugInfo({
        scale: this.scale,
        translateX: this.translateX,
        translateY: this.translateY,
        currentLOD: this.textureManager.currentLOD,
        lodLevelCount: SIMPLE_LOD_LEVELS.length,
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        imageWidth: this.imageWidth,
        imageHeight: this.imageHeight,
        fitToScreenScale,
        userMaxScale,
        effectiveMaxScale,
        originalSizeScale,
        maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
        quality: this.currentQuality,
        isLoading: this.isLoadingTexture,
        tileOutlineEnabled: this.tileOutlineEnabled,
        lodTextureCount: this.textureManager.textureCount,
        tileCache: this.tileCache,
        currentVisibleTiles: this.currentVisibleTiles,
        loadingTiles: this.tileRequestRuntime.loadingTiles,
        pendingTileRequests: this.tileRequestRuntime.pendingTileRequests,
      }),
    );
  }

  private notifyZoomChange() {
    if (this.onZoomChange) {
      const originalScale = this.scale;
      const fitToScreenScale = this.getFitToScreenScale();
      const configuredFitScale = fitToScreenScale * this.config.initialScale;
      const relativeScale = this.scale / configuredFitScale;
      this.onZoomChange(originalScale, relativeScale);
    }
  }

  private notifyLoadingStateChange(
    isLoading: boolean,

    state?: LoadingState,
    quality?: "high" | "medium" | "low" | "unknown",
  ) {
    if (this.onLoadingStateChange) {
      this.onLoadingStateChange(
        isLoading,
        state,
        quality || this.currentQuality,
      );
    }
  }

  // 事件处理
  private setupEventListeners() {
    this.inputController = new WebGLInputController(this.canvas, this.config, {
      isAnimating: () => this.animationController.isAnimating,
      stopAnimation: () => this.stopAnimation(),
      panBy: (deltaX, deltaY) => this.panBy(deltaX, deltaY),
      zoomAt: (x, y, scaleFactor, animated) =>
        this.zoomAt(x, y, scaleFactor, animated),
      performDoubleClickAction: (x, y) => this.performDoubleClickAction(x, y),
    });
    this.inputController.connect();
  }

  private stopAnimation(): void {
    this.animationController.cancel();
  }

  private panBy(deltaX: number, deltaY: number): void {
    this.translateX += deltaX;
    this.translateY += deltaY;
    this.constrainImagePosition();
    this.render();
  }

  private performDoubleClickAction(x: number, y: number) {
    this.animationController.cancel();

    if (this.config.doubleClick.mode === "toggle") {
      const result = resolveDoubleClickToggle({
        isZoomed: this.isDoubleClickZoomed,
        point: { x, y },
        transform: this.getTransformState(),
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        fitToScreenScale: this.getFitToScreenScale(),
        initialScale: this.config.initialScale,
        minScale: this.config.minScale,
        maxScale: this.config.maxScale,
        step: this.config.doubleClick.step,
      });

      this.startAnimation(
        result.transform.scale,
        result.transform.translateX,
        result.transform.translateY,
        this.config.doubleClick.animationTime,
      );
      this.isDoubleClickZoomed = result.isZoomed;
    } else {
      this.zoomAt(x, y, this.config.doubleClick.step, true);
    }
  }

  public zoomAt(x: number, y: number, scaleFactor: number, animated = false) {
    const nextTransform = zoomAtTransform(
      this.getTransformState(),
      this.getViewportGeometry(),
      this.getTransformBounds(),
      { x, y },
      scaleFactor,
    );

    if (!nextTransform) return;

    if (animated && this.config.smooth) {
      this.startAnimation(
        nextTransform.scale,
        nextTransform.translateX,
        nextTransform.translateY,
      );
    } else {
      this.applyTransformState(nextTransform);
      this.render();
      this.notifyZoomChange();
    }
  }

  async copyOriginalImageToClipboard() {
    try {
      const didCopy = await copyImageUrlToClipboard(this.originalImageSrc);
      if (!didCopy) {
        console.warn("Clipboard API not supported");
        return;
      }

      if (this.onImageCopied) {
        this.onImageCopied();
      }
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
    }
  }
}
