import {
  createShader,
  FRAGMENT_SHADER_SOURCE,
  VERTEX_SHADER_SOURCE,
} from "./shaders";

export class WebGLViewerRenderer {
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly texCoordBuffer: WebGLBuffer;
  private readonly tileOutlineBuffer: WebGLBuffer;
  private readonly positionLocation: number;
  private readonly texCoordLocation: number;
  private readonly matrixLocation: WebGLUniformLocation;
  private readonly imageLocation: WebGLUniformLocation;
  private readonly renderModeLocation: WebGLUniformLocation;
  private readonly solidColorLocation: WebGLUniformLocation;
  private disposed = false;

  constructor(private readonly gl: WebGLRenderingContext) {
    let vertexShader: WebGLShader | null = null;
    let fragmentShader: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let texCoordBuffer: WebGLBuffer | null = null;
    let tileOutlineBuffer: WebGLBuffer | null = null;

    try {
      vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      fragmentShader = createShader(
        gl,
        gl.FRAGMENT_SHADER,
        FRAGMENT_SHADER_SOURCE,
      );

      program = gl.createProgram();
      if (!program) {
        throw new Error("Failed to create WebGL program");
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(
          `Program linking failed: ${gl.getProgramInfoLog(program)}`,
        );
      }

      gl.useProgram(program);

      const positionLocation = gl.getAttribLocation(program, "a_position");
      const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
      if (positionLocation === -1 || texCoordLocation === -1) {
        throw new Error("Failed to get attribute locations");
      }

      const matrixLocation = gl.getUniformLocation(program, "u_matrix");
      const imageLocation = gl.getUniformLocation(program, "u_image");
      const renderModeLocation = gl.getUniformLocation(program, "u_renderMode");
      const solidColorLocation = gl.getUniformLocation(program, "u_solidColor");
      if (
        matrixLocation === null ||
        imageLocation === null ||
        renderModeLocation === null ||
        solidColorLocation === null
      ) {
        throw new Error("Failed to get uniform locations");
      }

      positionBuffer = this.createBuffer(
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        "position",
      );
      texCoordBuffer = this.createBuffer(
        new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
        "texCoord",
      );
      tileOutlineBuffer = this.createBuffer(
        new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
        "outline",
      );

      this.program = program;
      this.positionBuffer = positionBuffer;
      this.texCoordBuffer = texCoordBuffer;
      this.tileOutlineBuffer = tileOutlineBuffer;
      this.positionLocation = positionLocation;
      this.texCoordLocation = texCoordLocation;
      this.matrixLocation = matrixLocation;
      this.imageLocation = imageLocation;
      this.renderModeLocation = renderModeLocation;
      this.solidColorLocation = solidColorLocation;

      gl.enableVertexAttribArray(positionLocation);
      gl.enableVertexAttribArray(texCoordLocation);
      this.bindQuadBuffers();
      gl.uniform1i(renderModeLocation, 0);
    } catch (error) {
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer);
      if (tileOutlineBuffer) gl.deleteBuffer(tileOutlineBuffer);
      if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      // Once linked, shaders are owned by the program. Marking them for
      // deletion here also covers every constructor failure path.
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    }
  }

  prepareFrame(width: number, height: number): void {
    const { gl } = this;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    // Base and tile textures describe the same source pixels at different
    // resolutions. Source-over blending would composite translucent pixels
    // twice where a tile replaces the base. Textured draws therefore replace
    // framebuffer pixels; blending is only enabled for debug outlines.
    gl.disable(gl.BLEND);
    this.bindQuadBuffers();
    gl.uniform1i(this.renderModeLocation, 0);
  }

  drawTexturedQuad(texture: WebGLTexture, matrix: Float32Array): void {
    const { gl } = this;
    gl.disable(gl.BLEND);
    gl.uniformMatrix3fv(this.matrixLocation, false, matrix);
    gl.uniform1i(this.imageLocation, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  drawTileOutlines(tileMatrices: Float32Array[], enabled: boolean): void {
    if (!enabled || tileMatrices.length === 0) {
      return;
    }

    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.renderModeLocation, 1);
    gl.uniform4f(this.solidColorLocation, 1, 0.4, 0, 0.7);
    this.bindOutlineBuffer();
    gl.lineWidth(1);

    for (const matrix of tileMatrices) {
      gl.uniformMatrix3fv(this.matrixLocation, false, matrix);
      gl.drawArrays(gl.LINE_LOOP, 0, 4);
    }

    this.bindQuadBuffers();
    gl.uniform1i(this.renderModeLocation, 0);
    gl.disable(gl.BLEND);
  }

  createTexture(
    source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Failed to allocate WebGL texture");
    }

    try {
      // This renderer owns its context. Keep one post-allocation error check
      // for OOM/context-loss fallback, without a preceding synchronous round-trip.
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );

      const uploadError = gl.getError();
      if (uploadError !== gl.NO_ERROR) {
        throw new Error(
          `WebGL texture upload failed (${describeWebGLError(gl, uploadError)})`,
        );
      }
      return texture;
    } catch (error) {
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteTexture(texture);
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.texCoordBuffer);
    this.gl.deleteBuffer(this.tileOutlineBuffer);
    this.gl.deleteProgram(this.program);
  }

  private createBuffer(data: Float32Array, label: string): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error(`Failed to create ${label} buffer`);
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    return buffer;
  }

  private bindQuadBuffers(): void {
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  }

  private bindOutlineBuffer(): void {
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tileOutlineBuffer);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
  }
}

function describeWebGLError(gl: WebGLRenderingContext, error: number): string {
  if (error === gl.INVALID_ENUM) return "INVALID_ENUM";
  if (error === gl.INVALID_VALUE) return "INVALID_VALUE";
  if (error === gl.INVALID_OPERATION) return "INVALID_OPERATION";
  if (error === gl.OUT_OF_MEMORY) return "OUT_OF_MEMORY";
  if (error === gl.CONTEXT_LOST_WEBGL) return "CONTEXT_LOST_WEBGL";
  return `0x${error.toString(16)}`;
}
