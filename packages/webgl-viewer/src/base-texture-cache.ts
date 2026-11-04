import type { ImageDimensions } from "./source-image-policy";

export interface CachedBaseTexture {
  texture: WebGLTexture;
  imageWidth: number;
  imageHeight: number;
  lodLevel: number;
  size: ImageDimensions;
  sourceSize: ImageDimensions | null;
}

/** Context-local ownership: entries are removed when borrowed by the active image. */
export class BaseTextureCache {
  private readonly entries = new Map<symbol | string, CachedBaseTexture>();
  private readonly identities = new WeakMap<Blob, symbol>();
  private bytes = 0;

  constructor(
    private readonly release: (texture: WebGLTexture) => void,
    private readonly maxBytes: number,
    private readonly maxEntries = 2,
  ) {}

  take(key: Blob | string): CachedBaseTexture | undefined {
    const identity = typeof key === "string" ? key : this.identities.get(key);
    return identity === undefined ? undefined : this.takeEntry(identity);
  }

  private takeEntry(key: symbol | string): CachedBaseTexture | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.bytes -= byteSize(entry);
    }
    return entry;
  }

  put(key: Blob | string, entry: CachedBaseTexture): void {
    const previous = this.take(key);
    if (previous && previous.texture !== entry.texture)
      this.release(previous.texture);
    const bytes = byteSize(entry);
    if (bytes <= 0 || bytes > this.maxBytes || this.maxEntries < 1) {
      this.release(entry.texture);
      return;
    }
    while (
      this.entries.size >= this.maxEntries ||
      this.bytes + bytes > this.maxBytes
    ) {
      const oldest = this.entries.keys().next().value!;
      this.release(this.takeEntry(oldest)!.texture);
    }
    let identity: symbol | string;
    if (typeof key === "string") {
      identity = key;
    } else {
      identity = this.identities.get(key) ?? Symbol();
      this.identities.set(key, identity);
    }
    this.entries.set(identity, entry);
    this.bytes += bytes;
  }

  clear(releaseTextures = true): void {
    if (releaseTextures)
      for (const entry of this.entries.values()) this.release(entry.texture);
    this.entries.clear();
    this.bytes = 0;
  }

  get byteSize(): number {
    return this.bytes;
  }
}

function byteSize(entry: CachedBaseTexture): number {
  return entry.size.width * entry.size.height * 4;
}
