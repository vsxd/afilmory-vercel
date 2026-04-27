import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGLImageViewerEngine } from './WebGLImageViewerEngine'

class ResizeObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()
}

class WorkerMock {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

function createWebGLMock(): WebGLRenderingContext {
  return {
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
    getProgramInfoLog: vi.fn(() => ''),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
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
  } as unknown as WebGLRenderingContext
}

function createEngine(canvas: HTMLCanvasElement): WebGLImageViewerEngine {
  return new WebGLImageViewerEngine(canvas, {
    src: 'blob:photo',
    className: '',
    width: 100,
    height: 100,
    initialScale: 1,
    minScale: 0.1,
    maxScale: 10,
    wheel: { step: 0.2 },
    pinch: { step: 5 },
    doubleClick: { step: 0.7, mode: 'toggle', animationTime: 200 },
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
    debug: false,
  })
}

describe('WebGLImageViewerEngine lifecycle', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  const originalWorker = globalThis.Worker
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('Worker', WorkerMock)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:worker'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.ResizeObserver = originalResizeObserver
    globalThis.Worker = originalWorker
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
  })

  it('ignores pending animation frames after destroy', () => {
    let pendingFrame: FrameRequestCallback | undefined
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrame = callback
      return 42
    })
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const canvas = document.createElement('canvas')
    const gl = createWebGLMock()
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl)
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    })

    const engine = createEngine(canvas)
    void engine.loadImage('blob:photo', 100, 100)
    engine.resetView()
    engine.destroy()

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    vi.mocked(gl.drawArrays).mockClear()
    expect(pendingFrame).toBeDefined()
    const frame = pendingFrame as FrameRequestCallback
    frame(16)
    expect(gl.drawArrays).not.toHaveBeenCalled()
  })
})
