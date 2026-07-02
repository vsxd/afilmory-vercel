import { debugLog } from "~/lib/debug-log";
import { isMobileDevice } from "~/lib/device-viewport";
import { LRUCache } from "~/lib/lru-cache";

export interface ImageCacheResult {
  blobSrc: string;
  blob: Blob;
  originalSize: number;
  format: string;
}

export type RegularImageCache = LRUCache<string, ImageCacheResult>;

// 原图 blob 体积悬殊（相机直出 3-10MB+），仅按条目数（50）封顶时真实驻留可达
// 250MB+——iOS Safari 标签页内存预算 ~1GB，这个底座会显著提前 jetsam 杀页。
// 按字节预算逐出：移动端收紧、桌面放宽（磁盘侧还有 SW CacheFirst 兜底，逐出的
// 原图重取不走网络）。
const CACHE_BYTE_BUDGET = isMobileDevice ? 64 * 1024 * 1024 : 256 * 1024 * 1024;

export function createRegularImageCache(): RegularImageCache {
  return new LRUCache<string, ImageCacheResult>(
    50,
    (value, _key, reason) => {
      try {
        URL.revokeObjectURL(value.blobSrc);
        debugLog(`Regular image cache: Revoked blob URL - ${reason}`);
      } catch (error) {
        console.warn(
          `Failed to revoke regular image blob URL (${reason}):`,
          error,
        );
      }
    },
    {
      maxBytes: CACHE_BYTE_BUDGET,
      sizeOf: (value) => value.blob.size,
    },
  );
}
