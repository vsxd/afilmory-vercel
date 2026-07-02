import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WebGLInputControllerHost } from "./input-controller";
import { WebGLInputController } from "./input-controller";
import type { WebGLImageViewerProps } from "./interface";
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

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

function createWebGLMock(): WebGLRenderingContext {
  return Object.assign(Object.create(null), {
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
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getProgramInfoLog: vi.fn(() => ""),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    lineWidth: vi.fn(),
    linkProgram: vi.fn(),
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
    pinch: { step: 5 },
    doubleClick: { step: 0.7, mode: "toggle", animationTime: 200 },
    panning: {},
    limitToBounds: true,
    centerOnInit: true,
    smooth: true,
    alignmentAnimation: { sizeX: 0, sizeY: 0, velocityAlignmentTime: 200 },
    velocityAnimation: { sensitivity: 1, animationTime: 200 },
    onZoomChange: () => {},
    onImageCopied: () => {},
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
    void engine.loadImage("blob:photo", 100, 100);
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

  it("sends the decoded image blob to the texture worker when available", () => {
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

    void engine.loadImage("blob:photo", 100, 100, sourceBlob);

    expect(WorkerMock.instances.at(-1)?.postMessage).toHaveBeenCalledWith({
      type: "load-image",
      payload: { url: "blob:photo", blob: sourceBlob },
    });

    engine.destroy();
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
    };
  }

  function createController(host: WebGLInputControllerHost) {
    const canvas = document.createElement("canvas");
    const config = {
      pinch: { step: 5 },
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
});
