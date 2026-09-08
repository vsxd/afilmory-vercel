interface DecodedTiffPixels {
  width: number;
  height: number;
  data: Uint8Array | Uint16Array | Float32Array | Float64Array;
  bitsPerSample: number;
  components: number;
  alpha: boolean;
  type: number;
  sampleFormat: number;
  planarConfiguration: number;
}

/** The decoder has already unpacked 1-bit, inverted WhiteIsZero and unpremultiplied alpha. */
export function tiffPixelsToRgba(
  frame: DecodedTiffPixels,
  target: Uint8ClampedArray,
): void {
  const { data, bitsPerSample, components, alpha, type, width, height } = frame;
  const grayscale = type === 0 || type === 1;
  const expectedComponents = (grayscale ? 1 : 3) + (alpha ? 1 : 0);
  if (
    (!grayscale && type !== 2) ||
    components !== expectedComponents ||
    frame.planarConfiguration !== 1
  ) {
    throw new Error("Unsupported TIFF pixel layout");
  }
  const floatingPoint =
    frame.sampleFormat === 3 && (bitsPerSample === 32 || bitsPerSample === 64);
  const integer =
    frame.sampleFormat === 1 && [1, 8, 16].includes(bitsPerSample);
  if (!floatingPoint && !integer)
    throw new Error("Unsupported TIFF sample format");
  if (
    target.length !== width * height * 4 ||
    data.length !== width * height * components
  ) {
    throw new Error("Invalid TIFF pixel buffer length");
  }
  const scale = floatingPoint ? 255 : 255 / (2 ** bitsPerSample - 1);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const source = pixel * components;
    const destination = pixel * 4;
    target[destination] = Math.round(data[source] * scale);
    target[destination + 1] = Math.round(
      data[source + (grayscale ? 0 : 1)] * scale,
    );
    target[destination + 2] = Math.round(
      data[source + (grayscale ? 0 : 2)] * scale,
    );
    target[destination + 3] = alpha
      ? Math.round(data[source + components - 1] * scale)
      : 255;
  }
}
