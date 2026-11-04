import { describe, expect, it, vi } from "vitest";

import { WebGLViewerRenderer } from "./renderer";

function createGlMock(): WebGLRenderingContext & {
  __createBuffer: ReturnType<typeof vi.fn<() => WebGLBuffer | null>>;
  __createTexture: ReturnType<typeof vi.fn<() => WebGLTexture | null>>;
} {
  const createBuffer = vi.fn<() => WebGLBuffer | null>(
    () => ({}) as WebGLBuffer,
  );
  const createTexture = vi.fn<() => WebGLTexture | null>(
    () => ({}) as WebGLTexture,
  );
  return Object.assign(Object.create(null), {
    __createBuffer: createBuffer,
    __createTexture: createTexture,
    ARRAY_BUFFER: 0x8892,
    BLEND: 0x0be2,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    CONTEXT_LOST_WEBGL: 0x9242,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    INVALID_ENUM: 0x0500,
    INVALID_OPERATION: 0x0502,
    INVALID_VALUE: 0x0501,
    LINE_LOOP: 0x0002,
    LINEAR: 0x2601,
    LINK_STATUS: 0x8b82,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    NO_ERROR: 0,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    OUT_OF_MEMORY: 0x0505,
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
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNSIGNED_BYTE: 0x1401,
    VERTEX_SHADER: 0x8b31,
    MAX_VIEWPORT_DIMS: 0x0d3a,
    activeTexture: vi.fn(),
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    blendFunc: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer,
    createProgram: vi.fn<() => WebGLProgram | null>(() => ({}) as WebGLProgram),
    createShader: vi.fn<() => WebGLShader | null>(() => ({}) as WebGLShader),
    createTexture,
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    disable: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getError: vi.fn(() => 0),
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

describe("WebGLViewerRenderer", () => {
  it("checks upload errors once per texture and preserves context-loss failure", () => {
    const gl = createGlMock();
    const renderer = new WebGLViewerRenderer(gl);
    renderer.createTexture({} as ImageBitmap);
    expect(gl.getError).toHaveBeenCalledTimes(1);
    vi.mocked(gl.getError).mockReturnValueOnce(gl.CONTEXT_LOST_WEBGL);
    expect(() => renderer.createTexture({} as ImageBitmap)).toThrow(
      /CONTEXT_LOST/,
    );
    expect(gl.getError).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  });

  it("throws and deletes a texture when allocation returns null", () => {
    const gl = createGlMock();
    const renderer = new WebGLViewerRenderer(gl);
    gl.__createTexture.mockReturnValueOnce(null);

    expect(() => renderer.createTexture({} as ImageBitmap)).toThrow(
      /allocate WebGL texture/,
    );
  });

  it("turns a texImage2D GL error into a failure and frees the texture", () => {
    const gl = createGlMock();
    const renderer = new WebGLViewerRenderer(gl);
    vi.mocked(gl.getError).mockReturnValueOnce(gl.OUT_OF_MEMORY);
    const texture = {} as WebGLTexture;
    gl.__createTexture.mockReturnValueOnce(texture);

    expect(() => renderer.createTexture({} as ImageBitmap)).toThrow(
      /OUT_OF_MEMORY/,
    );
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
  });

  it("replaces translucent base pixels with tiles instead of blending twice", () => {
    const gl = createGlMock();
    const renderer = new WebGLViewerRenderer(gl);
    const matrix = new Float32Array(9);

    renderer.prepareFrame(100, 100);
    renderer.drawTexturedQuad({} as WebGLTexture, matrix);

    expect(gl.disable).toHaveBeenCalledWith(gl.BLEND);
    expect(gl.enable).not.toHaveBeenCalledWith(gl.BLEND);

    renderer.drawTileOutlines([matrix], true);
    expect(gl.enable).toHaveBeenCalledWith(gl.BLEND);
    expect(gl.blendFunc).toHaveBeenCalledWith(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  });

  it("rolls back partially-created buffers when construction fails", () => {
    const gl = createGlMock();
    const first = {} as WebGLBuffer;
    gl.__createBuffer.mockReturnValueOnce(first).mockReturnValueOnce(null);

    expect(() => new WebGLViewerRenderer(gl)).toThrow(/texCoord buffer/);
    expect(gl.deleteBuffer).toHaveBeenCalledWith(first);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });
});
