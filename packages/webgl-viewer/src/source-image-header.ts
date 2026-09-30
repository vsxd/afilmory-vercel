const MAX_HEADER_BYTES = 256 * 1024;

interface ImageDimensions {
  width: number;
  height: number;
}

/** Bounded header inspection only; pixel validity remains the browser decoder's job. */
export async function readSourceImageDimensions(
  blob: Blob,
): Promise<ImageDimensions | null> {
  try {
    const bytes = new Uint8Array(
      await blob.slice(0, MAX_HEADER_BYTES).arrayBuffer(),
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (matches(bytes, 0, "\x89PNG\r\n\x1a\n")) {
      if (
        bytes.length < 33 ||
        view.getUint32(8) !== 13 ||
        !matches(bytes, 12, "IHDR")
      )
        return null;
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      return width <= 0x7fffffff &&
        height <= 0x7fffffff &&
        hasUnorientedPngEnd(bytes, view)
        ? dimensions(width, height)
        : null;
    }
    if (matches(bytes, 0, "GIF87a") || matches(bytes, 0, "GIF89a")) {
      return bytes.length >= 13
        ? dimensions(view.getUint16(6, true), view.getUint16(8, true))
        : null;
    }
    if (matches(bytes, 0, "RIFF") && matches(bytes, 8, "WEBP")) {
      return readWebp(bytes, view, blob.size);
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes, view);
    return null;
  } catch {
    return null;
  }
}

function dimensions(width: number, height: number): ImageDimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function matches(bytes: Uint8Array, offset: number, text: string): boolean {
  return (
    offset + text.length <= bytes.length &&
    [...text].every(
      (character, index) => bytes[offset + index] === character.codePointAt(0),
    )
  );
}

function hasUnorientedPngEnd(bytes: Uint8Array, view: DataView): boolean {
  // eXIf can follow IDAT. If the bounded prefix cannot rule it out, let the
  // browser discover the oriented dimensions rather than requesting a resize.
  let offset = 33;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (
      offset + length + 12 > bytes.length ||
      matches(bytes, offset + 4, "eXIf")
    )
      return false;
    if (matches(bytes, offset + 4, "IEND")) return length === 0;
    offset += length + 12;
  }
  return false;
}

function readWebp(
  bytes: Uint8Array,
  view: DataView,
  fileSize: number,
): ImageDimensions | null {
  if (bytes.length < 20) return null;
  const end = view.getUint32(4, true) + 8;
  const length = view.getUint32(16, true);
  if (end > fileSize || 20 + length + (length % 2) > end) return null;
  if (matches(bytes, 12, "VP8X") && length === 10 && bytes.length >= 30) {
    // Extended WebP may carry EXIF orientation after its compressed pixels.
    if (bytes[20] & 0x08) return null;
    const read24 = (offset: number) =>
      bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    return dimensions(read24(24) + 1, read24(27) + 1);
  }
  if (
    matches(bytes, 12, "VP8L") &&
    length >= 5 &&
    bytes.length >= 25 &&
    bytes[20] === 0x2f &&
    bytes[24] >> 5 === 0
  ) {
    const packed = view.getUint32(21, true);
    return dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  }
  if (
    matches(bytes, 12, "VP8 ") &&
    length >= 10 &&
    bytes.length >= 30 &&
    (bytes[20] & 1) === 0 &&
    matches(bytes, 23, "\x9d\x01\x2a")
  ) {
    return dimensions(
      view.getUint16(26, true) & 0x3fff,
      view.getUint16(28, true) & 0x3fff,
    );
  }
  return null;
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  let offset = 2;
  let size: ImageDimensions | null = null;
  let orientation = 1;
  const oriented = () =>
    size && orientation >= 5
      ? { width: size.height, height: size.width }
      : size;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) return oriented();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (!marker || marker === 0xd8 || offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker === 0xda)
      return length >= 8 && length === 6 + bytes[offset + 2] * 2
        ? oriented()
        : null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (length < 11 || length !== 8 + bytes[offset + 7] * 3) return null;
      size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      if (!size) return null;
    }
    if (marker === 0xe1 && matches(bytes, offset + 2, "Exif\0\0")) {
      const value = readOrientation(bytes.subarray(offset + 8, end));
      if (value === null) return null;
      orientation = value;
    }
    offset = end;
  }
  // Without a complete pre-scan header, a later EXIF marker could still rotate it.
  return null;
}

function readOrientation(bytes: Uint8Array): number | null {
  if (bytes.length < 8) return null;
  const little = matches(bytes, 0, "II");
  if (!little && !matches(bytes, 0, "MM")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42) return null;
  const ifd = view.getUint32(4, little);
  if (ifd < 8 || ifd + 2 > bytes.length) return null;
  const count = view.getUint16(ifd, little);
  if (ifd + 2 + count * 12 + 4 > bytes.length) return null;
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x112) continue;
    if (
      view.getUint16(entry + 2, little) !== 3 ||
      view.getUint32(entry + 4, little) !== 1
    )
      return null;
    const orientation = view.getUint16(entry + 8, little);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return 1;
}
