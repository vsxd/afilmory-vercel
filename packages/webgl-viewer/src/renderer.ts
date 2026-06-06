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

  constructor(private readonly gl: WebGLRenderingContext) {
    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE,
    );
    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER_SOURCE,
    );

    const program = gl.createProgram();
    if (!program) {
      throw new Error("Failed to create WebGL program");
    }
    this.program = program;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Program linking failed: ${gl.getProgramInfoLog(program)}`,
      );
    }

    gl.useProgram(program);

    this.positionLocation = gl.getAttribLocation(program, "a_position");
    this.texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

    if (this.positionLocation === -1 || this.texCoordLocation === -1) {
      throw new Error("Failed to get attribute locations");
    }

    const matrixLocation = gl.getUniformLocation(program, "u_matrix");
    const imageLocation = gl.getUniformLocation(program, "u_image");
    const renderModeLocation = gl.getUniformLocation(program, "u_renderMode");
    const solidColorLocation = gl.getUniformLocation(program, "u_solidColor");

    if (
      !matrixLocation ||
      !imageLocation ||
      !renderModeLocation ||
      !solidColorLocation
    ) {
      throw new Error("Failed to get uniform locations");
    }

    this.matrixLocation = matrixLocation;
    this.imageLocation = imageLocation;
    this.renderModeLocation = renderModeLocation;
    this.solidColorLocation = solidColorLocation;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.positionBuffer = this.createBuffer(
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      "position",
    );
    this.texCoordBuffer = this.createBuffer(
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      "texCoord",
    );
    this.tileOutlineBuffer = this.createBuffer(
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      "outline",
    );

    gl.enableVertexAttribArray(this.positionLocation);
    gl.enableVertexAttribArray(this.texCoordLocation);

    this.bindQuadBuffers();
    gl.uniform1i(this.renderModeLocation, 0);
  }

  prepareFrame(width: number, height: number): void {
    const { gl } = this;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    this.bindQuadBuffers();
    gl.uniform1i(this.renderModeLocation, 0);
  }

  drawTexturedQuad(texture: WebGLTexture, matrix: Float32Array): void {
    const { gl } = this;
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
  }

  createTexture(
    source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): WebGLTexture | null {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    return texture;
  }

  dispose(): void {
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
