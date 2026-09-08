import type { RegularImageCache } from "./image-cache-service";
import { ImageConverterManager } from "./image-convert";
import type { LoadingCallbacks } from "./image-loading-types";
import { throwIfAborted } from "./media-resource";

/** Converts/caches bytes only; URL ownership belongs to the consumer. */
export class ImageConversionService {
  constructor(
    private readonly cache: RegularImageCache,
    private readonly converter = new ImageConverterManager(),
  ) {}

  getCachedRegularImage(url: string): Blob | null {
    return this.cache.get(url)?.blob ?? null;
  }

  async processImageBlob(
    blob: Blob,
    url: string,
    callbacks: LoadingCallbacks,
    signal: AbortSignal,
  ): Promise<Blob> {
    throwIfAborted(signal);
    const converted = await this.converter.convertImage(
      blob,
      url,
      callbacks,
      signal,
    );
    throwIfAborted(signal);
    const result = converted.blob;
    throwIfAborted(signal);
    const cached = this.cache.get(url);
    if (cached) return cached.blob;
    this.cache.set(url, {
      blob: result,
      originalSize: blob.size,
      format: result.type,
    });
    return result;
  }
}
