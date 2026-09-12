import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WebGLInputControllerHost } from "./input-controller";
import { WebGLInputController } from "./input-controller";
import type { DebugInfo, WebGLImageViewerProps } from "./interface";
import { WebGLImageViewerEngine } from "./WebGLImageViewerEngine";

function firePointer(
  target: EventTarget,
  type: string,
  clientX: number,
  clientY: number,
  pointerId = 1,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      pointerId,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    }),
  );
}

// 双击由两次快速 tap 合成（第 2 次 pointerup 触发），取代原生 dblclick。
function doubleTap(target: EventTarget, clientX: number, clientY: number) {
  firePointer(target, "pointerdown", clientX, clientY);
  firePointer(target, "pointerup", clientX, clientY);
  firePointer(target, "pointerdown", clientX, clientY);
  firePointer(target, "pointerup", clientX, clientY);
}

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

class WorkerMock {
  static instances: WorkerMock[] = [];

  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private latestSessionId = 0;
  set onmessage(handler: ((event: MessageEvent) => void) | null) {
    this.messageHandler = handler;
  }
  get onmessage(): ((event: MessageEvent) => void) | null {
    if (!this.messageHandler) return null;
    return (event) => {
      const data = event.data as Record<string, unknown>;
      this.messageHandler?.({
        ...event,
        data: { sessionId: this.latestSessionId, ...data },
      });
    };
  }
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((message) => {
    if (message.type === "load-image" && message.payload?.sessionId) {
      this.latestSessionId = message.payload.sessionId;
    }
  });
  terminate = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

function createWebGLMock(): WebGLRenderingContext & {
  __loseContext: ReturnType<typeof vi.fn>;
  __createProgram: ReturnType<typeof vi.fn<() => WebGLProgram | null>>;
  __createTexture: ReturnType<typeof vi.fn<() => WebGLTexture | null>>;
} {
  const loseContext = vi.fn();
  const createProgram = vi.fn<() => WebGLProgram | null>(
    () => ({}) as WebGLProgram,
  );
  const createTexture = vi.fn<() => WebGLTexture | null>(
    () => ({}) as WebGLTexture,
  );
  return Object.assign(Object.create(null), {
    __loseContext: loseContext,
    __createProgram: createProgram,
    __createTexture: createTexture,
    getExtension: vi.fn((name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
    ),
    ARRAY_BUFFER: 0x8892,
    BLEND: 0x0be2,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    LINE_LOOP: 0x0002,
    LINEAR: 0x2601,
    LINK_STATUS: 0x8b82,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_VIEWPORT_DIMS: 0x0d3a,
    NO_ERROR: 0,
    INVALID_ENUM: 0x0500,
    INVALID_VALUE: 0x0501,
    INVALID_OPERATION: 0x0502,
    OUT_OF_MEMORY: 0x0505,
    CONTEXT_LOST_WEBGL: 0x9242,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    RGBA: 0x1908,
    SRC_ALPHA: 0x0302,
    STATIC_DRAW: 0x88e4,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TRIANGLES: 0x0004,
    UNSIGNED_BYTE: 0x1401,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    VERTEX_SHADER: 0x8b31,
    activeTexture: vi.fn(),
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    blendFunc: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn<() => WebGLBuffer | null>(() => ({}) as WebGLBuffer),
    createProgram,
    createShader: vi.fn<() => WebGLShader | null>(() => ({}) as WebGLShader),
    createTexture,
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    drawArrays: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getError: vi.fn(() => 0),
    getParameter: vi.fn(() => 4096),
    getProgramInfoLog: vi.fn(() => ""),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    lineWidth: vi.fn(),
    linkProgram: vi.fn(),
    pixelStorei: vi.fn(),
    shaderSource: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1i: vi.fn(),
    uniform4f: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn(),
  });
}

function createEngine(
  canvas: HTMLCanvasElement,
  overrides: Partial<Required<WebGLImageViewerProps>> = {},
): WebGLImageViewerEngine {
  return new WebGLImageViewerEngine(canvas, {
    src: "blob:photo",
    sourceBlob: null,
    className: "",
    width: 100,
    height: 100,
    initialScale: 1,
    minScale: 0.1,
    maxScale: 10,
    wheel: { step: 0.2 },
    pinch: {},
    doubleClick: { step: 0.7, mode: "toggle", animationTime: 200 },
    panning: {},
    limitToBounds: true,
    centerOnInit: true,
    smooth: true,
    onZoomChange: () => {},
    onLoadingStateChange: () => {},
    onImagePainted: () => {},
    onError: () => {},
    debug: false,
    ...overrides,
  });
}

describe("WebGLImageViewerEngine lifecycle", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalWorker = globalThis.Worker;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    WorkerMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("Worker", WorkerMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:worker"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.Worker = originalWorker;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("ignores pending animation frames after destroy", () => {
    let pendingFrame: FrameRequestCallback | undefined;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pendingFrame = callback;
        return 42;
      });
    vi.spyOn(performance, "now").mockReturnValue(0);
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    // destroy 会拒绝仍挂起的 loadImage promise，测试侧需吞掉这个预期内的拒绝
    engine.loadImage("blob:photo", 100, 100).catch(() => {});
    engine.resetView();
    engine.destroy();

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    vi.mocked(gl.drawArrays).mockClear();
    if (!pendingFrame) {
      throw new Error("Expected a pending animation frame");
    }
    pendingFrame(16);
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it("stops an active zoom when smooth motion is disabled without disposing image resources", () => {
    let pendingFrame: FrameRequestCallback | undefined;
    const scheduleFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pendingFrame = callback;
        return 42;
      });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 100, 100),
    );
    const engine = createEngine(canvas, {
      doubleClick: { step: 2, mode: "toggle", animationTime: 200 },
    });
    engine.loadImage("blob:photo", 1000, 1000).catch(() => {});
    const worker = WorkerMock.instances.at(-1)!;
    const loadCalls = worker.postMessage.mock.calls.length;

    engine.zoomAt(50, 50, 2, true);
    now.mockReturnValue(50);
    pendingFrame?.(50);
    const interruptedScale = engine.getScale();
    expect(interruptedScale).toBeGreaterThan(0.1);
    expect(interruptedScale).toBeLessThan(0.2);

    engine.setSmooth(false);
    expect(cancelFrame).toHaveBeenCalledWith(42);
    scheduleFrame.mockClear();
    now.mockReturnValue(500);
    pendingFrame?.(500);
    expect(engine.getScale()).toBe(interruptedScale);
    expect(scheduleFrame).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledTimes(loadCalls);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(gl.__loseContext).not.toHaveBeenCalled();

    // Future reset and double-click actions are immediate, including actions
    // that explicitly configured a nonzero animation duration.
    engine.resetView();
    expect(engine.getScale()).toBeCloseTo(0.1);
    doubleTap(canvas, 50, 50);
    expect(engine.getScale()).toBeCloseTo(0.2);
    expect(scheduleFrame).not.toHaveBeenCalled();

    engine.setSmooth(true);
    engine.resetView();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it("treats the configured initial scale as the fitted zoom baseline", () => {
    const onZoomChange = vi.fn();
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas, {
      initialScale: 0.9,
      minScale: 0.9,
      onZoomChange,
    });

    void engine.loadImage("blob:photo", 100, 100);

    expect(engine.getScale()).toBeCloseTo(0.9);

    engine.zoomAt(50, 50, 1.1);

    expect(engine.getScale()).toBeCloseTo(0.99);
    const lastZoomChange = onZoomChange.mock.calls.at(-1);
    expect(lastZoomChange?.[0]).toBeCloseTo(0.99);
    expect(lastZoomChange?.[1]).toBeCloseTo(1.1);
  });

  it("uses the double-click step as the fitted zoom target in toggle mode", () => {
    let now = 0;
    let currentDateNow = 1000;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Date, "now").mockImplementation(() => currentDateNow);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 42;
    });
    const runPendingFrame = (timestamp: number) => {
      const frame = pendingFrame;
      expect(frame).toBeDefined();
      if (!frame) {
        throw new Error("Expected a pending animation frame");
      }
      pendingFrame = undefined;
      now = timestamp;
      frame(timestamp);
    };

    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas, {
      maxScale: 20,
      doubleClick: { step: 2, mode: "toggle", animationTime: 200 },
    });

    void engine.loadImage("blob:photo", 1000, 1000);
    expect(engine.getScale()).toBeCloseTo(0.1);

    doubleTap(canvas, 50, 50);

    runPendingFrame(200);
    expect(engine.getScale()).toBeCloseTo(0.2);

    currentDateNow = 1400;
    doubleTap(canvas, 50, 50);

    runPendingFrame(400);
    expect(engine.getScale()).toBeCloseTo(0.1);
  });

  it("does not zoom past original size on double-click toggle", () => {
    let now = 0;
    const currentDateNow = 1000;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Date, "now").mockImplementation(() => currentDateNow);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 42;
    });
    const runPendingFrame = (timestamp: number) => {
      const frame = pendingFrame;
      expect(frame).toBeDefined();
      if (!frame) {
        throw new Error("Expected a pending animation frame");
      }
      pendingFrame = undefined;
      now = timestamp;
      frame(timestamp);
    };

    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 800,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas, {
      maxScale: 20,
      doubleClick: { step: 2, mode: "toggle", animationTime: 200 },
    });

    void engine.loadImage("blob:photo", 1000, 1000);
    expect(engine.getScale()).toBeCloseTo(0.8);

    doubleTap(canvas, 400, 400);

    runPendingFrame(200);
    expect(engine.getScale()).toBeCloseTo(1);
  });

  it("snaps a micro pinch-zoom back to the fitted scale on release", () => {
    let now = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 42;
    });
    const runPendingFrame = (timestamp: number) => {
      const frame = pendingFrame;
      expect(frame).toBeDefined();
      if (!frame) {
        throw new Error("Expected a pending animation frame");
      }
      pendingFrame = undefined;
      now = timestamp;
      frame(timestamp);
    };

    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    void engine.loadImage("blob:photo", 1000, 1000);
    expect(engine.getScale()).toBeCloseTo(0.1); // 贴合比例

    // 双指捏合放大 5%（距离 20 → 21）：留下微小缩放残留
    firePointer(canvas, "pointerdown", 40, 50, 1);
    firePointer(canvas, "pointerdown", 60, 50, 2);
    firePointer(canvas, "pointermove", 61, 50, 2);
    expect(engine.getScale()).toBeCloseTo(0.105);

    // 全部松手 → 回吸动画把残留吸回精确贴合（否则上层「已缩放」判定恒真，
    // 下滑关闭手势永久失效）
    firePointer(canvas, "pointerup", 40, 50, 1);
    firePointer(canvas, "pointerup", 61, 50, 2);
    runPendingFrame(400);
    expect(engine.getScale()).toBeCloseTo(0.1);
  });

  it("releases the WebGL context on destroy (WEBGL_lose_context)", () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    engine.destroy();

    // 只删纹理/缓冲不够：不 loseContext 的话，每次查看器开关都遗留一个
    // 满载绘制缓冲的上下文，iOS Safari 累积数次即触发整页强制重载。
    expect(gl.getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(gl.__loseContext).toHaveBeenCalledTimes(1);
  });

  it("sends the decoded image blob and the GPU texture size cap to the texture worker", () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const sourceBlob = new Blob(["photo"], { type: "image/jpeg" });
    const engine = createEngine(canvas);

    // destroy 会拒绝仍挂起的 loadImage promise，测试侧需吞掉这个预期内的拒绝
    engine.loadImage("blob:photo", 100, 100, sourceBlob).catch(() => {});

    // maxTextureSize 必须随消息传入（按上下文查询），worker 据此钳制底图，
    // 否则超大原图的 0.5x 底图超过老设备 MAX_TEXTURE_SIZE 会渲染成黑块。
    expect(WorkerMock.instances.at(-1)?.postMessage).toHaveBeenCalledWith({
      type: "load-image",
      payload: {
        sessionId: 1,
        url: "blob:photo",
        blob: sourceBlob,
        maxTextureSize: 4096,
        maxTextureBytes: 64 * 1024 * 1024,
      },
    });
    expect(gl.getParameter).toHaveBeenCalledWith(gl.MAX_TEXTURE_SIZE);

    engine.destroy();
  });

  it("reports honest quality: upgrades only when the visible LOD tile set is fully cached", () => {
    const onLoadingStateChange = vi.fn();
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas, { onLoadingStateChange });
    const worker = WorkerMock.instances.at(-1)!;
    const emit = (data: unknown) =>
      worker.onmessage?.({ data } as MessageEvent);

    void engine.loadImage("blob:photo", 100, 100);

    // emit() 只接受 unknown，结构化位图夹具无需断言成 ImageBitmap
    const makeBitmap = () => ({ width: 50, height: 50, close: vi.fn() });

    // 底图（LOD 1 → low）就位
    emit({
      type: "image-loaded",
      payload: {
        imageBitmap: makeBitmap(),
        imageWidth: 100,
        imageHeight: 100,
        lodLevel: 1,
      },
    });
    expect(onLoadingStateChange).toHaveBeenLastCalledWith(
      false,
      undefined,
      "low",
    );

    // worker 就绪 → 派发可见瓦片请求（100×100 图在 LOD 2 只有 1 片）
    emit({ type: "init-done" });
    const createTileCall = worker.postMessage.mock.calls.find(
      ([message]) => message.type === "create-tile",
    );
    expect(createTileCall).toBeDefined();
    const { key, lodLevel } = createTileCall![0].payload;
    expect(lodLevel).toBe(2);

    // 该 LOD 的可见瓦片全部就绪 → 质量升级为 medium，且只多触发一次回调
    onLoadingStateChange.mockClear();
    emit({
      type: "tile-created",
      payload: { key, imageBitmap: makeBitmap(), lodLevel },
    });
    expect(onLoadingStateChange).toHaveBeenCalledTimes(1);
    expect(onLoadingStateChange).toHaveBeenCalledWith(
      false,
      undefined,
      "medium",
    );

    // 同一 LOD 重复就绪 → 质量未变，不再触发
    onLoadingStateChange.mockClear();
    emit({
      type: "tile-created",
      payload: { key, imageBitmap: makeBitmap(), lodLevel },
    });
    expect(onLoadingStateChange).not.toHaveBeenCalled();

    engine.destroy();
  });

  it("keeps the tile subsystem idle at fit view and engages it past base resolution", () => {
    // 只伪造 setTimeout/clearTimeout（渲染循环防抖用），rAF 吞掉即可
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const emit = (data: unknown) =>
      worker.onmessage?.({ data } as MessageEvent);
    const createTileCalls = () =>
      worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "create-tile",
      );

    // destroy 会拒绝仍挂起的 loadImage promise，测试侧需吞掉这个预期内的拒绝
    engine.loadImage("blob:photo", 1000, 1000).catch(() => {});

    // 1000×1000 图贴合 100×100 画布 → scale 0.1 → 选中 LOD 0（0.25）。
    // 0.5x 底图（500×500）分辨率已 ≥ LOD 0 → 瓦片系统必须完全按兵不动。
    emit({
      type: "image-loaded",
      payload: {
        imageBitmap: { width: 500, height: 500, close: vi.fn() },
        imageWidth: 1000,
        imageHeight: 1000,
        lodLevel: 1,
      },
    });
    emit({ type: "init-done" });
    vi.runAllTimers(); // 渲染循环的防抖更新也要跑完
    expect(createTileCalls()).toHaveLength(0);

    // 放大越过底图分辨率（0.1 → 0.6 > 0.5）→ 选中 LOD 2，瓦片开始请求
    engine.zoomAt(50, 50, 6);
    vi.runAllTimers();
    const calls = createTileCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const [message] of calls) {
      expect(message.payload.lodLevel).toBe(2);
    }

    engine.destroy();
  });

  it("downgrades the quality signal back to the base texture when zooming from tiles to fit", () => {
    // 回归：底图覆盖跳过路径不再触发 onVisibleLodReady，缩回 fit 后质量会滞留在
    // 瓦片态的偏高值——需要显式 onCoveredByBase 把 currentQuality 降回底图水平。
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const onLoadingStateChange = vi.fn();
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    // 通过 debug 回调读取引擎自己的可见瓦片集合，避免依赖分帧派发的时序：
    // 缩放后整段可见集可能跨多帧派发，这里直接把可见集里每片都喂成就绪。
    let visibleTiles: string[] = [];
    const debugRef: React.RefObject<(info: DebugInfo) => void> = {
      current: (info: DebugInfo) => {
        visibleTiles = info.tileSystem?.visibleKeys ?? [];
      },
    };

    const engine = new WebGLImageViewerEngine(
      canvas,
      {
        src: "blob:photo",
        sourceBlob: null,
        className: "",
        width: 100,
        height: 100,
        initialScale: 1,
        minScale: 0.1,
        maxScale: 10,
        wheel: { step: 0.2 },
        pinch: {},
        doubleClick: { step: 0.7, mode: "toggle", animationTime: 200 },
        panning: {},
        limitToBounds: true,
        centerOnInit: true,
        smooth: true,
        onZoomChange: () => {},
        onLoadingStateChange,
        onImagePainted: () => {},
        onError: () => {},
        debug: false,
      } as Required<WebGLImageViewerProps>,
      debugRef,
    );
    const worker = WorkerMock.instances.at(-1)!;
    const emit = (data: unknown) =>
      worker.onmessage?.({ data } as MessageEvent);
    const lastQuality = () =>
      onLoadingStateChange.mock.calls.at(-1)?.[2] as string | undefined;
    // emit() 只接受 unknown，结构化位图夹具无需断言成 ImageBitmap
    const makeBitmap = () => ({ width: 512, height: 512, close: vi.fn() });

    // destroy 会拒绝仍挂起的 loadImage promise，测试侧需吞掉这个预期内的拒绝
    engine.loadImage("blob:photo", 1000, 1000).catch(() => {});

    // fit：0.5x 底图（LOD 1 → low）覆盖 LOD 0，瓦片按兵不动
    emit({
      type: "image-loaded",
      payload: {
        imageBitmap: { width: 500, height: 500, close: vi.fn() },
        imageWidth: 1000,
        imageHeight: 1000,
        lodLevel: 1,
      },
    });
    emit({ type: "init-done" });
    vi.runAllTimers();
    expect(lastQuality()).toBe("low");

    // 放大越过底图分辨率（0.1 → 0.6 > 0.5）→ 选中 LOD 2（scale 1 → medium）。
    // 把整段可见集喂成就绪 → onVisibleLodReady 触发，质量升级为 medium。
    engine.zoomAt(50, 50, 6);
    vi.runAllTimers();
    engine.setTileOutlineEnabled(engine.isTileOutlineEnabled()); // 触发一次 render 刷新 debug 快照
    expect(visibleTiles.length).toBeGreaterThan(0);
    for (const key of visibleTiles) {
      emit({
        type: "tile-created",
        payload: { key, imageBitmap: makeBitmap(), lodLevel: 2 },
      });
    }
    expect(lastQuality()).toBe("medium");

    // 缩回 fit：底图重新覆盖选中 LOD → 质量必须降回底图的 low，而不是滞留在 medium
    engine.zoomAt(50, 50, 1 / 6);
    vi.runAllTimers();
    expect(lastQuality()).toBe("low");

    engine.destroy();
  });

  it("closes transferred bitmaps arriving after destroy instead of leaking them until GC", () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const emit = (data: unknown) =>
      worker.onmessage?.({ data } as MessageEvent);

    engine.destroy();

    // terminate 后，事件循环里已排队的消息仍会送达一拍：位图必须立即关闭
    const baseBitmap = { width: 500, height: 500, close: vi.fn() };
    emit({
      type: "image-loaded",
      payload: {
        imageBitmap: baseBitmap,
        imageWidth: 1000,
        imageHeight: 1000,
        lodLevel: 1,
      },
    });
    expect(baseBitmap.close).toHaveBeenCalledTimes(1);

    const tileBitmap = { width: 512, height: 512, close: vi.fn() };
    emit({
      type: "tile-created",
      payload: { key: "0-0-2", imageBitmap: tileBitmap, lodLevel: 2 },
    });
    expect(tileBitmap.close).toHaveBeenCalledTimes(1);

    // 不带位图的消息照旧安全忽略
    expect(() => emit({ type: "init-done" })).not.toThrow();
  });

  it("rejects a second loadImage with a different URL — one engine serves one image", async () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const emit = (data: unknown) =>
      worker.onmessage?.({ data } as MessageEvent);

    const first = engine.loadImage("blob:photo", 100, 100);
    await expect(engine.loadImage("blob:other", 100, 100)).rejects.toThrow(
      /renders a single image/,
    );

    // 首图加载不受影响，仍被 image-loaded 正常结算
    emit({
      type: "image-loaded",
      payload: {
        imageBitmap: { width: 50, height: 50, close: vi.fn() },
        imageWidth: 100,
        imageHeight: 100,
        lodLevel: 1,
      },
    });
    await expect(first).resolves.toBeUndefined();

    engine.destroy();
  });

  it("supersedes a still-pending load when the same URL is re-issued (context restore path)", async () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const emit = (data: unknown) =>
      worker.onmessage?.({ data } as MessageEvent);

    const first = engine.loadImage("blob:photo", 100, 100);
    const second = engine.loadImage("blob:photo", 100, 100);
    await expect(first).rejects.toThrow(/superseded/);

    emit({
      type: "image-loaded",
      payload: {
        imageBitmap: { width: 50, height: 50, close: vi.fn() },
        imageWidth: 100,
        imageHeight: 100,
        lodLevel: 1,
      },
    });
    await expect(second).resolves.toBeUndefined();

    engine.destroy();
  });

  it("rejects the load and closes the bitmap when base texture allocation fails", async () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const load = engine.loadImage("blob:photo", 100, 100);
    const bitmap = { width: 50, height: 50, close: vi.fn() };
    gl.__createTexture.mockReturnValueOnce(null);

    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 1,
        payload: {
          imageBitmap: bitmap,
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);

    await expect(load).rejects.toThrow(/allocate WebGL texture/);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it("settles a pending load when the worker crashes", async () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const load = engine.loadImage("blob:photo", 100, 100);

    worker.onerror?.(
      new ErrorEvent("error", {
        error: new Error("decoder crashed"),
        message: "decoder crashed",
      }),
    );

    await expect(load).rejects.toThrow("decoder crashed");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it("closes stale generation bitmaps without settling the current load", async () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const first = engine.loadImage("blob:photo", 100, 100);
    const second = engine.loadImage("blob:photo", 100, 100);
    await expect(first).rejects.toThrow(/superseded/);

    const staleBitmap = { width: 50, height: 50, close: vi.fn() };
    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 1,
        payload: {
          imageBitmap: staleBitmap,
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);
    expect(staleBitmap.close).toHaveBeenCalledTimes(1);

    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 2,
        payload: {
          imageBitmap: { width: 50, height: 50, close: vi.fn() },
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);
    await expect(second).resolves.toBeUndefined();
    engine.destroy();
  });

  it("retains the source blob when reloading after context restoration", async () => {
    const contextWarning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const sourceBlob = new Blob(["photo"]);
    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const first = engine.loadImage("blob:photo", 100, 100, sourceBlob);
    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 1,
        payload: {
          imageBitmap: { width: 50, height: 50, close: vi.fn() },
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);
    await first;

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(contextWarning).toHaveBeenCalledWith(
      "WebGL context lost; pausing rendering until restored.",
    );
    canvas.dispatchEvent(new Event("webglcontextrestored"));

    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "load-image",
      payload: {
        sessionId: 2,
        url: "blob:photo",
        blob: sourceBlob,
        maxTextureSize: 4096,
        maxTextureBytes: 64 * 1024 * 1024,
      },
    });

    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 2,
        payload: {
          imageBitmap: { width: 50, height: 50, close: vi.fn() },
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);
    await Promise.resolve();
    engine.destroy();
  });

  it("keeps a pending image load alive across context restoration", async () => {
    const contextWarning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const engine = createEngine(canvas);
    const worker = WorkerMock.instances.at(-1)!;
    const pending = engine.loadImage("blob:photo", 100, 100);

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    const bitmapDuringLoss = { width: 50, height: 50, close: vi.fn() };
    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 1,
        payload: {
          imageBitmap: bitmapDuringLoss,
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);
    expect(bitmapDuringLoss.close).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(contextWarning).toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "load-image",
      payload: {
        sessionId: 2,
        url: "blob:photo",
        blob: null,
        maxTextureSize: 4096,
        maxTextureBytes: 64 * 1024 * 1024,
      },
    });

    worker.onmessage?.({
      data: {
        type: "image-loaded",
        sessionId: 2,
        payload: {
          imageBitmap: { width: 50, height: 50, close: vi.fn() },
          imageWidth: 100,
          imageHeight: 100,
          lodLevel: 1,
        },
      },
    } as MessageEvent);
    await expect(pending).resolves.toBeUndefined();
    engine.destroy();
  });

  it("derives double-click toggle state from scale and honors zero animation time", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const engine = createEngine(canvas, {
      doubleClick: { step: 2, mode: "toggle", animationTime: 0 },
    });
    engine.loadImage("blob:photo", 1000, 1000).catch(() => {});
    engine.zoomAt(50, 50, 2);
    expect(engine.getScale()).toBeCloseTo(0.2);

    doubleTap(canvas, 50, 50);

    expect(engine.getScale()).toBeCloseTo(0.1);
    engine.destroy();
  });

  it("rolls back the WebGL context if construction fails partway", () => {
    const canvas = document.createElement("canvas");
    const gl = createWebGLMock();
    vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    gl.__createProgram.mockReturnValueOnce(null);

    expect(() => createEngine(canvas)).toThrow(/create WebGL program/);
    expect(gl.__loseContext).toHaveBeenCalledTimes(1);
    expect(WorkerMock.instances).toHaveLength(0);
  });
});

describe("WebGLInputController pointer arbitration", () => {
  function createHost(): WebGLInputControllerHost {
    return {
      isAnimating: vi.fn(() => false),
      stopAnimation: vi.fn(),
      panBy: vi.fn(),
      zoomAt: vi.fn(),
      performDoubleClickAction: vi.fn(),
      onPinchEnd: vi.fn(),
    };
  }

  function createController(host: WebGLInputControllerHost) {
    const canvas = document.createElement("canvas");
    const config = {
      pinch: {},
      panning: {},
      doubleClick: { step: 0.7, mode: "toggle", animationTime: 200 },
      wheel: { step: 0.2 },
    } as Partial<
      Required<WebGLImageViewerProps>
    > as Required<WebGLImageViewerProps>;
    const controller = new WebGLInputController(canvas, config, host);
    controller.connect();
    return { canvas, controller };
  }

  it("pans on a single-pointer drag", () => {
    const host = createHost();
    const { canvas } = createController(host);
    firePointer(canvas, "pointerdown", 100, 100);
    firePointer(canvas, "pointermove", 130, 150);
    expect(host.panBy).toHaveBeenCalledWith(30, 50);
  });

  it("stops panning after lostpointercapture (dismiss steals the pointer)", () => {
    const host = createHost();
    const { canvas } = createController(host);
    firePointer(canvas, "pointerdown", 100, 100);
    firePointer(canvas, "pointermove", 120, 120);
    expect(host.panBy).toHaveBeenCalledTimes(1);
    // 祖先手势夺走捕获 → 控制器遗忘该指针，后续 move 不再平移
    firePointer(canvas, "lostpointercapture", 120, 120);
    firePointer(canvas, "pointermove", 200, 200);
    expect(host.panBy).toHaveBeenCalledTimes(1);
  });

  it("zooms on a two-pointer pinch instead of panning", () => {
    const host = createHost();
    const { canvas } = createController(host);
    firePointer(canvas, "pointerdown", 100, 100, 1);
    firePointer(canvas, "pointerdown", 200, 100, 2); // 第二指 → pinch 基线 = 100
    firePointer(canvas, "pointermove", 260, 100, 2); // 距离 100 → 160
    expect(host.zoomAt).toHaveBeenCalled();
    expect(host.panBy).not.toHaveBeenCalled();
  });

  it("notifies onPinchEnd once when all fingers of a pinch gesture lift", () => {
    const host = createHost();
    const { canvas } = createController(host);
    firePointer(canvas, "pointerdown", 100, 100, 1);
    firePointer(canvas, "pointerdown", 200, 100, 2);
    firePointer(canvas, "pointermove", 220, 100, 2);
    firePointer(canvas, "pointerup", 100, 100, 1); // 还剩一指，不触发
    expect(host.onPinchEnd).not.toHaveBeenCalled();
    firePointer(canvas, "pointerup", 220, 100, 2); // 全部抬起 → 触发一次
    expect(host.onPinchEnd).toHaveBeenCalledTimes(1);
  });

  it("does not notify onPinchEnd for a plain single-pointer pan", () => {
    const host = createHost();
    const { canvas } = createController(host);
    firePointer(canvas, "pointerdown", 100, 100);
    firePointer(canvas, "pointermove", 130, 150);
    firePointer(canvas, "pointerup", 130, 150);
    expect(host.onPinchEnd).not.toHaveBeenCalled();
  });
});
