import { debugLog } from "~/lib/debug-log";
import { LRUCache } from "~/lib/lru-cache";

export interface ImageCacheResult {
  blobSrc: string;
  blob: Blob;
  originalSize: number;
  format: string;
}

export type RegularImageCache = LRUCache<string, ImageCacheResult>;

export function createRegularImageCache(): RegularImageCache {
  return new LRUCache<string, ImageCacheResult>(50, (value, _key, reason) => {
    try {
      URL.revokeObjectURL(value.blobSrc);
      debugLog(`Regular image cache: Revoked blob URL - ${reason}`);
    } catch (error) {
      console.warn(
        `Failed to revoke regular image blob URL (${reason}):`,
        error,
      );
    }
  });
}
