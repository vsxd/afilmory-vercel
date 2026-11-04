import type { TextureWorkerMessage } from "./worker-protocol";

export type ImagePreview = Extract<
  TextureWorkerMessage,
  { type: "image-loaded" }
>["payload"];

/**
 * Runtime-owned decoded previews, shared across short-lived WebGL contexts.
 * Uploads borrow synchronously; only the cache closes accepted bitmaps.
 * Weak source identities do not keep the original compressed files alive.
 */
export class ImagePreviewCache {
  private readonly identities = new WeakMap<Blob, symbol>();
  private readonly entries = new Map<symbol, ImagePreview>();
  private bytes = 0;
  private disposed = false;

  constructor(
    private readonly maxBytes = 32 * 1024 * 1024,
    private readonly maxEntries = 6,
  ) {}

  get(source: Blob): ImagePreview | undefined {
    const key = this.identities.get(source);
    const entry = key === undefined ? undefined : this.entries.get(key);
    if (entry && key !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  /** true transfers bitmap ownership to this cache; false leaves it with the caller. */
  set(source: Blob, preview: ImagePreview): boolean {
    const size = preview.imageBitmap.width * preview.imageBitmap.height * 4;
    if (
      this.disposed ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > this.maxBytes ||
      this.maxEntries < 1
    )
      return false;
    let key = this.identities.get(source);
    if (key === undefined) {
      key = Symbol();
      this.identities.set(source, key);
    }
    if (this.entries.get(key)?.imageBitmap === preview.imageBitmap) return true;
    this.remove(key);
    while (
      this.entries.size >= this.maxEntries ||
      this.bytes + size > this.maxBytes
    ) {
      this.remove(this.entries.keys().next().value!);
    }
    this.entries.set(key, preview);
    this.bytes += size;
    return true;
  }

  get byteSize(): number {
    return this.bytes;
  }

  dispose(): void {
    this.disposed = true;
    for (const key of this.entries.keys()) this.remove(key);
  }

  private remove(key: symbol): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.bytes -= entry.imageBitmap.width * entry.imageBitmap.height * 4;
    entry.imageBitmap.close();
  }
}
