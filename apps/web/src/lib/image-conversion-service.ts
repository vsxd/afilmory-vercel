import { debugLog } from "~/lib/debug-log";
import type {
  ImageCacheResult,
  RegularImageCache,
} from "~/lib/image-cache-service";
import { imageConverterManager } from "~/lib/image-convert";
import type {
  ImageLoadResult,
  LoadingCallbacks,
} from "~/lib/image-loading-types";

function createRegularImageCacheKey(url: string): string {
  return url;
}

export class ImageConversionService {
  constructor(private readonly regularImageCache: RegularImageCache) {}

  getCachedRegularImage(
    originalUrl: string,
    callbacks: LoadingCallbacks,
  ): ImageLoadResult | null {
    const cacheKey = createRegularImageCacheKey(originalUrl);
    const cachedResult = this.regularImageCache.get(cacheKey);

    if (!cachedResult) {
      return null;
    }

    debugLog("Using cached regular image result", cachedResult);
    callbacks.onLoadingStateUpdate?.({
      isVisible: false,
    });

    return {
      blobSrc: cachedResult.blobSrc,
      blob: cachedResult.blob,
    };
  }

  async processImageBlob(
    blob: Blob,
    originalUrl: string,
    callbacks: LoadingCallbacks,
  ): Promise<ImageLoadResult> {
    try {
      const conversionResult = await imageConverterManager.convertImage(
        blob,
        originalUrl,
        callbacks,
      );

      if (conversionResult) {
        debugLog(
          `Image converted: ${(blob.size / 1024).toFixed(1)}KB -> ${(conversionResult.convertedSize / 1024).toFixed(1)}KB`,
        );

        callbacks.onLoadingStateUpdate?.({
          isVisible: false,
        });

        return {
          blobSrc: conversionResult.url,
          blob: conversionResult.blob,
          convertedUrl: conversionResult.url,
        };
      }

      return this.processRegularImage(blob, originalUrl, callbacks);
    } catch (conversionError) {
      console.error("Image conversion failed:", conversionError);

      try {
        debugLog("Falling back to regular image processing");
        return this.processRegularImage(blob, originalUrl, callbacks);
      } catch (fallbackError) {
        console.error(
          "Fallback to regular image processing also failed:",
          fallbackError,
        );
        callbacks.onLoadingStateUpdate?.({
          isVisible: false,
        });
        callbacks.onError?.();
        throw conversionError;
      }
    }
  }

  private processRegularImage(
    blob: Blob,
    originalUrl: string,
    callbacks: LoadingCallbacks,
  ): ImageLoadResult {
    const cachedRegularImage = this.getCachedRegularImage(
      originalUrl,
      callbacks,
    );

    if (cachedRegularImage) {
      return cachedRegularImage;
    }

    const cacheKey = createRegularImageCacheKey(originalUrl);
    const url = URL.createObjectURL(blob);
    const result: ImageCacheResult = {
      blobSrc: url,
      blob,
      originalSize: blob.size,
      format: blob.type,
    };

    this.regularImageCache.set(cacheKey, result);
    debugLog(
      `Regular image processed and cached: ${(blob.size / 1024).toFixed(1)}KB, URL: ${originalUrl}`,
    );

    callbacks.onLoadingStateUpdate?.({
      isVisible: false,
    });

    return {
      blobSrc: url,
      blob,
    };
  }
}
