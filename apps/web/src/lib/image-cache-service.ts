import { isMobileDevice } from "~/lib/device-viewport";
import { LRUCache } from "~/lib/lru-cache";

export interface ImageCacheResult {
  blob: Blob;
  originalSize: number;
  format: string;
}

export type RegularImageCache = LRUCache<string, ImageCacheResult>;

// The budget bounds reusable cached bytes, not active consumers or decoded GPU
// textures. Eviction drops a Blob reference; consumer URL leases remain valid.
const CACHE_BYTE_BUDGET = isMobileDevice ? 64 * 1024 * 1024 : 256 * 1024 * 1024;

export function createRegularImageCache(): RegularImageCache {
  return new LRUCache<string, ImageCacheResult>(50, undefined, {
    maxBytes: CACHE_BYTE_BUDGET,
    sizeOf: (value) => value.blob.size,
  });
}
