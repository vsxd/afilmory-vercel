import { TransformAnimationController } from "./animation-controller";
import { resolveCanvasBackingStore } from "./canvas-memory";
import { createWebGLDebugInfo } from "./debug-adapter";
import { resolveDoubleClickToggle } from "./double-click-zoom-policy";
import { LoadingState } from "./enum";
import { WebGLInputController } from "./input-controller";
import type { DebugInfo, WebGLImageViewerProps } from "./interface";
import { WebGLViewerRenderer } from "./renderer";
import { BASE_TEXTURE_BYTE_BUDGET } from "./texture-dimensions";
import { getLodQuality, TextureLodManager } from "./texture-lod-manager";
import { SIMPLE_LOD_LEVELS } from "./tile-cache";
import { TileManager } from "./tile-manager";
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
import type { TextureWorkerMessage } from "./worker-protocol";

interface ActiveImageLoad {
  sessionId: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

// 简化的 WebGL 图像查看器引擎
export class WebGLImageViewerEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private renderer!: WebGLViewerRenderer;
  private textureManager!: TextureLodManager;
  private imageLoaded = false;
  private originalImageSrc = "";
  private originalSourceBlob: Blob | null = null;

  // 变换状态
  private scale = 1;
  private translateX = 0;
  private translateY = 0;
  private imageWidth = 0;
  private imageHeight = 0;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private devicePixelRatio = 1;

  // 动画状态
  private isDestroyed = false;
  private isContextLost = false;
  private boundContextLost: (event: Event) => void = () => {};
  private boundContextRestored: () => void = () => {};
  private animationFrameId: number | null = null;
  private readonly animationController = new TransformAnimationController();

  // 简化的纹理管理
  // 配置和回调
  private config: Required<WebGLImageViewerProps>;
  private onZoomChange?: (originalScale: number, relativeScale: number) => void;
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
  private hasWorkerFatalError = false;
  private textureWorkerInitialized = false;
  private tileOutlineEnabled = false;

  private boundResizeCanvas: () => void;

  // 瓦片系统（缓存/请求调度/可见集合/防抖全部由 TileManager 拥有）
  private readonly tileManager: TileManager;

  // GPU 能力：单纹理最大边长，用于钳制 worker 生成的底图纹理
  private readonly maxTextureSize: number;
  private readonly maxCanvasDimension: number;

  // 调试用真实数据：帧计数与底图纹理实际尺寸
  private frameCount = 0;
  private baseTextureSize: { width: number; height: number } | null = null;

  private loadGeneration = 0;
  private currentSessionId = 0;
  private activeLoad: ActiveImageLoad | null = null;
  private hasNotifiedImagePainted = false;

  constructor(
    canvas: HTMLCanvasElement,
    config: Required<WebGLImageViewerProps>,
    onDebugUpdate?: React.RefObject<(debugInfo: DebugInfo) => void>,
  ) {
    this.canvas = canvas;
    this.config = config;
    this.onZoomChange = config.onZoomChange;
    this.onLoadingStateChange = config.onLoadingStateChange;
    this.onImagePainted = config.onImagePainted;
    this.onDebugUpdate = onDebugUpdate;

    // 初始化 WebGL
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      // 关闭 MSAA：渲染内容是贴满视口的纹理四边形，多重采样只作用于图元边缘、
      // 对照片像素毫无收益，却让全屏抗锯齿后备缓冲的 GPU 内存翻倍（iOS 上尤其致命）。
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "default",
    });
    if (!gl) {
      throw new Error("WebGL not supported");
    }
    this.gl = gl;
    this.textureManager = new TextureLodManager(gl);
    this.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    this.maxCanvasDimension = getCanvasDimensionLimit(gl, this.maxTextureSize);

    this.tileManager = new TileManager({
      getViewport: () => ({
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        imageWidth: this.imageWidth,
        imageHeight: this.imageHeight,
        imageLoaded: this.imageLoaded,
        scale: this.scale,
        translateX: this.translateX,
        translateY: this.translateY,
      }),
      getSelectedLodLevel: () => this.selectOptimalLOD(),
      isLodCoveredByBase: (lodLevel) => this.isLodCoveredByBase(lodLevel),
      createTexture: (source) => this.createWebGLTexture(source),
      deleteTexture: (texture) => this.gl.deleteTexture(texture),
      requestRender: () => this.render(),
      canDispatchTiles: () =>
        !this.isDestroyed &&
        !this.isContextLost &&
        this.workerBridge !== null &&
        this.textureWorkerInitialized,
      requestTileFromWorker: (request) => {
        this.workerBridge?.createTile({
          ...request,
          sessionId: this.currentSessionId,
        });
      },
      onVisibleLodReady: (lodLevel) => this.handleVisibleLodReady(lodLevel),
      // 回到底图覆盖区间：质量应反映常驻底图（textureManager.currentLOD），否则
      // 从放大态缩回 fit 时 currentQuality 会滞留在瓦片态的偏高值。
      onCoveredByBase: () =>
        this.handleVisibleLodReady(this.textureManager.currentLOD),
    });

    this.boundResizeCanvas = () => this.resizeCanvas();

    try {
      this.setupCanvas();
      this.setupContextLossHandlers();
      this.initWebGL();
      this.initWorker();
      this.setupEventListeners();

      this.isLoadingTexture = false;
      this.notifyLoadingStateChange(false);
    } catch (error) {
      this.rollbackFailedConstruction();
      throw error;
    }
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
    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
    const backingStore = resolveCanvasBackingStore({
      cssWidth: rect.width,
      cssHeight: rect.height,
      requestedDpr: window.devicePixelRatio || 1,
      maxTextureSize: this.maxCanvasDimension,
    });
    this.devicePixelRatio = backingStore.dpr;

    this.canvas.width = backingStore.width;
    this.canvas.height = backingStore.height;
    this.gl.viewport(0, 0, backingStore.width, backingStore.height);

    if (this.imageLoaded) {
      this.constrainScaleAndPosition();
      this.render();
      this.notifyZoomChange();
    }
  }

  private setupContextLossHandlers() {
    this.boundContextLost = (event: Event) => this.handleContextLost(event);
    this.boundContextRestored = () => this.handleContextRestored();
    this.canvas.addEventListener("webglcontextlost", this.boundContextLost);
    this.canvas.addEventListener(
      "webglcontextrestored",
      this.boundContextRestored,
    );
  }

  private handleContextLost(event: Event) {
    // preventDefault() is required for the browser to attempt restoration and
    // later fire `webglcontextrestored`.
    event.preventDefault();
    this.isContextLost = true;

    // Stop every render/animation loop: drawing into a lost context is a no-op
    // that only produces console errors.
    this.animationController.cancel();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // All GPU textures are gone; drop the tile bookkeeping so a restore starts
    // clean.
    this.tileManager.reset();
    this.baseTextureSize = null;

    console.warn("WebGL context lost; pausing rendering until restored.");
  }

  private handleContextRestored() {
    if (this.isDestroyed) return;
    this.isContextLost = false;

    try {
      // Recreate all context-dependent resources (programs, buffers, textures).
      this.textureManager = new TextureLodManager(this.gl);
      this.initWebGL();
      this.imageLoaded = false;
      this.resizeCanvas();
    } catch (error) {
      const normalizedError = toError(
        error,
        "Failed to restore the WebGL context",
      );
      const hadPendingLoad = this.activeLoad !== null;
      this.isLoadingTexture = false;
      this.rejectActiveLoad(normalizedError);
      this.notifyLoadingStateChange(false);
      if (!hadPendingLoad) this.config.onError(normalizedError);
      return;
    }

    // Re-decode and re-upload the current image if one was loaded; otherwise
    // just repaint the (now empty) scene.
    if (this.originalImageSrc) {
      if (this.activeLoad) {
        this.restartPendingLoadAfterContextRestore();
        return;
      }
      this.loadImage(
        this.originalImageSrc,
        this.imageWidth || undefined,
        this.imageHeight || undefined,
        this.originalSourceBlob,
      ).catch((error) => {
        if (!this.isDestroyed) {
          console.error("Failed to reload image after context restore:", error);
          this.config.onError(error);
        }
      });
    } else {
      this.render();
    }
  }

  private restartPendingLoadAfterContextRestore(): void {
    if (!this.activeLoad || !this.workerBridge) return;

    this.hasNotifiedImagePainted = false;
    this.isLoadingTexture = true;
    this.textureWorkerInitialized = false;
    this.notifyLoadingStateChange(true, LoadingState.IMAGE_LOADING);
    this.tileManager.reset();

    const sessionId = ++this.loadGeneration;
    this.currentSessionId = sessionId;
    this.activeLoad.sessionId = sessionId;

    try {
      this.workerBridge.loadImage({
        sessionId,
        url: this.originalImageSrc,
        blob: this.originalSourceBlob,
        maxTextureSize: this.maxTextureSize,
        maxTextureBytes: BASE_TEXTURE_BYTE_BUDGET,
      });
    } catch (error) {
      this.rejectActiveLoad(
        toError(error, "Failed to reload the image after context restoration"),
        sessionId,
      );
      this.isLoadingTexture = false;
      this.notifyLoadingStateChange(false);
    }
  }

  private initWebGL() {
    this.renderer = new WebGLViewerRenderer(this.gl);
  }

  private initWorker() {
    this.workerBridge = new TextureWorkerBridge({
      onMessage: (event) => this.handleWorkerMessage(event),
      onError: (event) => {
        event.preventDefault();
        this.handleWorkerFatalError(
          event.error ?? new Error(event.message || "Texture worker crashed"),
        );
      },
      onMessageError: () =>
        this.handleWorkerFatalError(
          new Error("Texture worker returned an unreadable message"),
        ),
    });
  }

  private handleWorkerFatalError(error: unknown): void {
    if (this.isDestroyed || this.hasWorkerFatalError) return;
    this.hasWorkerFatalError = true;
    const normalizedError = toError(error, "Texture worker crashed");
    const hadPendingLoad = this.activeLoad !== null;
    this.isLoadingTexture = false;
    this.textureWorkerInitialized = false;
    this.rejectActiveLoad(normalizedError);
    this.workerBridge?.dispose();
    this.workerBridge = null;
    if (!hadPendingLoad) {
      this.config.onError(normalizedError);
    }
    this.notifyLoadingStateChange(false);
  }

  private handleWorkerMessage(e: MessageEvent<TextureWorkerMessage>) {
    const message = e.data;

    if (this.isDestroyed) {
      // destroy() 已 terminate worker，但已入队的消息这一拍仍会送达。转移来的
      // ImageBitmap（0.5x 底图可达 ~45MB）必须立即 close，不能等 GC——与
      // texture-worker-runtime.ts 里写明的 iOS 内存纪律同一条。
      if (message.type === "image-loaded" || message.type === "tile-created") {
        message.payload.imageBitmap.close();
      }
      return;
    }

    // A transferred bitmap can arrive after the context-loss event but before
    // restoration. Uploading it would reject the still-valid load promise;
    // restoration re-dispatches that load under a fresh worker session.
    if (this.isContextLost) {
      if (message.type === "image-loaded" || message.type === "tile-created") {
        message.payload.imageBitmap.close();
      }
      return;
    }

    if (message.sessionId !== this.currentSessionId) {
      if (message.type === "image-loaded" || message.type === "tile-created") {
        message.payload.imageBitmap.close();
      }
      return;
    }

    // 瓦片相关消息（tile-created / tile-error）由瓦片子系统消化
    if (this.tileManager.handleWorkerMessage(message)) {
      return;
    }

    if (message.type === "image-loaded") {
      const { imageBitmap, imageWidth, imageHeight, lodLevel } =
        message.payload;
      try {
        if (!this.imageWidth || !this.imageHeight) {
          this.imageWidth = imageWidth;
          this.imageHeight = imageHeight;
          this.setupInitialScaling();
        }

        this.notifyLoadingStateChange(true, LoadingState.CREATE_TEXTURE);

        const baseBitmapWidth = imageBitmap.width;
        const baseBitmapHeight = imageBitmap.height;
        const texture = this.createWebGLTexture(imageBitmap);
        this.textureManager.setBaseTexture(texture, lodLevel);
        this.baseTextureSize = {
          width: baseBitmapWidth,
          height: baseBitmapHeight,
        };
        this.currentQuality = getLodQuality(lodLevel);

        this.imageLoaded = true;
        this.isLoadingTexture = false;
        this.notifyLoadingStateChange(false);
        this.render();
        this.notifyZoomChange();
        this.resolveActiveLoad(message.sessionId);
      } catch (error) {
        this.imageLoaded = false;
        this.isLoadingTexture = false;
        this.rejectActiveLoad(
          toError(error, "Failed to upload the base image texture"),
          message.sessionId,
        );
        this.notifyLoadingStateChange(false);
      } finally {
        imageBitmap.close();
      }
      return;
    }

    if (message.type === "load-error") {
      this.isLoadingTexture = false;
      this.rejectActiveLoad(
        toError(message.payload.error, "Failed to load image in worker"),
        message.sessionId,
      );
      this.notifyLoadingStateChange(false);
      return;
    }

    if (message.type === "init-done") {
      this.textureWorkerInitialized = true;
      // After worker is initialized, we can start processing pending tiles.
      this.tileManager.updateTileCache();
    }
  }

  /**
   * 一个引擎实例只服务一张图：换图由 React 包装层整引擎重建（per-src
   * useEffect），因此对不同 URL 的再次调用直接拒绝——引擎的 imageWidth/
   * imageHeight 与瓦片键（`x-y-lod`，不含图像身份）都以首图为准，复用会把
   * 旧图的几何与瓦片渲染进新图。同一 URL 允许重复调用：上下文恢复路径会对
   * originalImageSrc 重新发起加载；若旧 promise 仍挂起，恢复流程会把它迁移到
   * 新 worker session，而不是把一次可恢复的上下文丢失暴露成加载失败。
   */
  async loadImage(
    url: string,
    preknownWidth?: number,
    preknownHeight?: number,
    sourceBlob?: Blob | null,
  ) {
    if (this.isDestroyed) {
      throw new Error("WebGL image viewer has been destroyed");
    }
    if (this.originalImageSrc && this.originalImageSrc !== url) {
      throw new Error(
        "WebGLImageViewerEngine renders a single image; create a new engine to load a different URL",
      );
    }
    if (!this.workerBridge) {
      throw new Error("Texture worker is unavailable");
    }

    this.hasNotifiedImagePainted = false;
    this.originalImageSrc = url;
    this.originalSourceBlob = sourceBlob ?? null;
    this.isLoadingTexture = true;
    this.textureWorkerInitialized = false;
    this.notifyLoadingStateChange(true, LoadingState.IMAGE_LOADING);

    if (preknownWidth && preknownHeight) {
      this.imageWidth = preknownWidth;
      this.imageHeight = preknownHeight;
      this.setupInitialScaling();
    }

    // 若上一次 loadImage 尚未结算就再次调用，先拒绝旧 promise，避免它永远挂起。
    this.rejectActiveLoad(new Error("loadImage superseded by a newer call"));
    this.tileManager.reset();
    const sessionId = ++this.loadGeneration;
    this.currentSessionId = sessionId;

    return new Promise<void>((resolve, reject) => {
      this.activeLoad = { sessionId, resolve, reject };

      try {
        this.workerBridge!.loadImage({
          sessionId,
          url,
          blob: sourceBlob ?? null,
          maxTextureSize: this.maxTextureSize,
          maxTextureBytes: BASE_TEXTURE_BYTE_BUDGET,
        });
      } catch (error) {
        this.rejectActiveLoad(
          toError(error, "Failed to send the image to the texture worker"),
          sessionId,
        );
      }
    });
  }

  private resolveActiveLoad(sessionId: number): void {
    if (this.activeLoad?.sessionId !== sessionId) return;
    const { resolve } = this.activeLoad;
    this.activeLoad = null;
    resolve();
  }

  private rejectActiveLoad(error: Error, sessionId?: number): void {
    if (!this.activeLoad) return;
    if (sessionId !== undefined && this.activeLoad.sessionId !== sessionId) {
      return;
    }
    const { reject } = this.activeLoad;
    this.activeLoad = null;
    reject(error);
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
  ): WebGLTexture {
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

  /**
   * 底图常驻渲染；当某 LOD 的输出分辨率不超过底图实际分辨率（可能被
   * MAX_TEXTURE_SIZE 钳制过）时，瓦片只是把底图内容重新解码一遍——GPU 内存
   * 约翻倍、worker 全图切片白做，更低的 LOD 甚至以更糊的瓦片盖住更清晰的
   * 底图。fit 视图（每张照片的默认状态）恰好落在这一区间，排队与绘制都要
   * 整段跳过，瓦片系统只在缩放越过底图分辨率后才介入。
   */
  private isLodCoveredByBase(lodLevel: number): boolean {
    if (!this.baseTextureSize || this.imageWidth <= 0) return false;
    const effectiveBaseScale = this.baseTextureSize.width / this.imageWidth;
    return SIMPLE_LOD_LEVELS[lodLevel].scale <= effectiveBaseScale;
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
      duration: animationTime ?? (this.config.smooth ? 300 : 0),
      from: startTransform,
      startLOD,
      startTime: performance.now(),
      to: targetTransform,
    });

    // 取消上一段动画可能仍排队的帧，否则旧回调会启动第二条并行的 rAF 链，
    // 在快速连续缩放时让渲染/动画步进翻倍。
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
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
      this.tileManager.updateTileCache();
    }
  }

  private fitImageToScreen() {
    this.applyTransformState(
      createFitTransform(this.getViewportGeometry(), this.config.initialScale),
    );
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

  /**
   * 诚实的质量回调：只有当前选定 LOD 的可见瓦片全部就绪时才上报该 LOD 对应的
   * 质量，且仅在质量实际变化时触发 onLoadingStateChange。
   */
  private handleVisibleLodReady(lodLevel: number) {
    const quality = getLodQuality(lodLevel);
    if (quality === this.currentQuality) return;
    this.currentQuality = quality;
    this.notifyLoadingStateChange(this.isLoadingTexture);
  }

  // 修改渲染方法以支持瓦片渲染
  private render() {
    if (this.isDestroyed || this.isContextLost) return;

    this.frameCount++;
    this.renderer.prepareFrame(this.canvas.width, this.canvas.height);
    if (this.canvasWidth <= 0 || this.canvasHeight <= 0) return;

    // 始终渲染一个低分辨率的底图作为回退，防止瓦片加载过程中出现空白
    if (this.textureManager.texture) {
      this.renderer.drawTexturedQuad(
        this.textureManager.texture,
        this.createMatrix(),
      );
    }

    // 渲染可见的瓦片（底图已覆盖该 LOD 分辨率时整段跳过——防抖更新到来前
    // 可见集里可能还留着这种瓦片，画上去只会用更糊的内容盖住底图）
    const lodLevel = this.selectOptimalLOD();
    const outlinedTileMatrices: Float32Array[] = [];

    if (!this.isLodCoveredByBase(lodLevel)) {
      for (const {
        texture,
        matrix,
      } of this.tileManager.collectVisibleRenderTiles(lodLevel)) {
        this.renderer.drawTexturedQuad(texture, matrix);
        if (this.tileOutlineEnabled) {
          outlinedTileMatrices.push(matrix);
        }
      }
    }

    this.renderer.drawTileOutlines(
      outlinedTileMatrices,
      this.tileOutlineEnabled,
    );
    this.notifyImagePainted();

    // 更新调试信息
    this.updateDebugInfo();

    // 定期更新瓦片缓存（100ms 防抖，由 TileManager 负责）
    this.tileManager.maybeScheduleUpdate(this.animationController.isAnimating);
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

  // 松手回吸的判定上限：相对贴合 ≤10% 的缩放视为无意残留。
  private static readonly SNAP_BACK_MAX_RELATIVE_SCALE = 1.1;

  /**
   * 捏合松手后的「回吸」（iOS 相册同款）：微小缩放残留（如 1.03×）视觉上与贴合
   * 无异，却让上层「已缩放」判定恒真——下滑关闭手势随之永久失效。松手时若缩放
   * 接近贴合，动画回正到精确贴合比例；动画每帧会 notifyZoomChange，上层状态自愈。
   */
  private snapBackFromMicroZoom() {
    const restScale = this.getFitToScreenScale() * this.config.initialScale;
    if (!(restScale > 0)) return;
    const relative = this.scale / restScale;
    if (
      relative < WebGLImageViewerEngine.SNAP_BACK_MAX_RELATIVE_SCALE &&
      Math.abs(relative - 1) > 1e-3
    ) {
      this.resetView();
    }
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

    window.removeEventListener("resize", this.boundResizeCanvas);
    this.canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.boundContextRestored,
    );
    this.inputController?.dispose();
    this.inputController = null;

    // 清理 WebGL 资源
    this.textureManager.dispose();
    this.renderer.dispose();
    // 瓦片子系统：取消排队任务并释放所有瓦片纹理，避免复用同一 canvas/context
    // 时 GPU 显存随换图累积泄漏。
    this.tileManager.dispose();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // destroy 是 superseded 之外另一条需要结算旧 promise 的路径：worker 一旦
    // terminate 就不会再有 image-loaded/load-error 消息，不拒绝则 promise 永远挂起。
    this.rejectActiveLoad(new Error("viewer destroyed"));

    this.workerBridge?.dispose();
    this.workerBridge = null;

    // 最后显式释放 WebGL 上下文本身。删除纹理/缓冲只回收了 GL 对象，上下文的
    // 绘制缓冲与驱动侧内存要等 JS GC 才释放——iOS WebKit 的 GC 在内存压力下才跑、
    // 且对同页存活上下文数量有硬上限：查看器每次开关都新建引擎，不 loseContext 会
    // 逐次累积 GPU 内存，最终触发 Safari 强制整页重载（jetsam）。
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private rollbackFailedConstruction(): void {
    this.isDestroyed = true;
    this.animationController.cancel();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener("resize", this.boundResizeCanvas);
    this.canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.boundContextRestored,
    );
    this.resizeObserver?.disconnect();
    this.inputController?.dispose();
    this.inputController = null;
    this.workerBridge?.dispose();
    this.workerBridge = null;
    this.tileManager.dispose();
    this.textureManager.dispose();
    this.renderer?.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
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
        renderCount: this.frameCount,
        maxTextureSize: this.maxTextureSize,
        quality: this.currentQuality,
        isLoading: this.isLoadingTexture,
        tileOutlineEnabled: this.tileOutlineEnabled,
        baseTextureSize: this.baseTextureSize,
        tileCache: this.tileManager.tileCache,
        currentVisibleTiles: this.tileManager.currentVisibleTiles,
        loadingTiles: this.tileManager.loadingTiles,
        pendingTileRequests: this.tileManager.pendingTileRequests,
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
      onPinchEnd: () => this.snapBackFromMicroZoom(),
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
      const configuredFitScale =
        this.getFitToScreenScale() * this.config.initialScale;
      const result = resolveDoubleClickToggle({
        isZoomed: this.scale > configuredFitScale * 1.001,
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
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error) return new Error(error);
  return new Error(fallbackMessage, { cause: error });
}

function getCanvasDimensionLimit(
  gl: WebGLRenderingContext,
  fallback: number,
): number {
  const renderbufferLimit = Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  const viewportDimensions = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as unknown;
  const viewportLimit =
    viewportDimensions instanceof Int32Array ||
    Array.isArray(viewportDimensions)
      ? Math.min(Number(viewportDimensions[0]), Number(viewportDimensions[1]))
      : Number(viewportDimensions);
  const limits = [renderbufferLimit, viewportLimit, fallback].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  return limits.length > 0 ? Math.min(...limits) : 0;
}
