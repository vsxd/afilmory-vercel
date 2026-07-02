/**
 * 通用 LRU 缓存类
 * 支持自定义清理函数，用于在缓存项被移除时执行清理操作（如释放 blob URL）
 */
/**
 * React Hook 用于管理 LRU 缓存的生命周期
 */
import { useEffect, useRef } from "react";

import { debugLog } from "./debug-log";

export interface LRUCacheByteBudget<V> {
  /** 总字节预算：超出时从最久未用开始逐出（至少保留最新一条） */
  maxBytes: number;
  /** 取单个条目的字节数（如 blob.size） */
  sizeOf: (value: V) => number;
}

export class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;
  private cleanupFn?: (value: V, key: K, reason: string) => void;
  // 可选字节预算：条目数上限适合同质小对象；缓存 blob 等大小悬殊的对象时，
  // 条目数无法约束真实内存占用（50 × 5MB 原图 ≈ 250MB），需按字节逐出。
  private byteBudget?: LRUCacheByteBudget<V>;
  private totalBytes = 0;

  constructor(
    maxSize = 10,
    cleanupFn?: (value: V, key: K, reason: string) => void,
    byteBudget?: LRUCacheByteBudget<V>,
  ) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.cleanupFn = cleanupFn;
    this.byteBudget = byteBudget;
  }

  private bytesOf(value: V): number {
    if (!this.byteBudget) return 0;
    const bytes = this.byteBudget.sizeOf(value);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  }

  private evictUntilWithinByteBudget(): void {
    if (!this.byteBudget) return;
    while (this.totalBytes > this.byteBudget.maxBytes && this.cache.size > 1) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      const firstValue = this.cache.get(firstKey)!;
      this._cleanup(
        firstValue,
        firstKey,
        `Byte-budget eviction: ${String(firstKey)}`,
      );
      this.totalBytes -= this.bytesOf(firstValue);
      this.cache.delete(firstKey);
    }
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    // If key already exists, clean up old value and delete it first
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key)!;
      this._cleanup(
        oldValue,
        key,
        `Replacing existing cache entry for ${String(key)}`,
      );
      this.totalBytes -= this.bytesOf(oldValue);
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const firstValue = this.cache.get(firstKey)!;
        this._cleanup(
          firstValue,
          firstKey,
          `LRU eviction: ${String(firstKey)}`,
        );
        this.totalBytes -= this.bytesOf(firstValue);
        this.cache.delete(firstKey);
      }
    }

    // Add new item (most recently used)
    this.cache.set(key, value);
    this.totalBytes += this.bytesOf(value);
    this.evictUntilWithinByteBudget();

    debugLog(
      `LRU Cache: Added ${String(key)}, cache size: ${this.cache.size}/${this.maxSize}`,
    );
  }

  /**
   * Remove a specific cache entry and clean up its value
   */
  delete(key: K): boolean {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this._cleanup(value, key, `Manual deletion: ${String(key)}`);
      this.totalBytes -= this.bytesOf(value);
      return this.cache.delete(key);
    }
    return false;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    // Clean up all cached values
    let cleanedCount = 0;
    for (const [key, value] of this.cache.entries()) {
      this._cleanup(value, key, `Cache clear: ${String(key)}`);
      cleanedCount++;
    }
    this.cache.clear();
    this.totalBytes = 0;
    debugLog(`LRU Cache: Cleared ${cleanedCount} cached items`);
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; maxSize: number; keys: K[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get all values (for iteration or debugging)
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * Get all entries (for iteration or debugging)
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  /**
   * Private method to safely execute cleanup function
   */
  private _cleanup(value: V, key: K, reason: string): void {
    if (this.cleanupFn) {
      try {
        this.cleanupFn(value, key, reason);
      } catch (error) {
        console.warn(`LRU Cache cleanup failed (${reason}):`, error);
      }
    }
  }
}

/**
 * 创建一个专门用于 blob URL 的 LRU 缓存
 * 自动在项目被移除时调用 URL.revokeObjectURL
 */
export function createBlobUrlCache<T extends { url?: string }>(
  maxSize = 10,
): LRUCache<string, T> {
  return new LRUCache<string, T>(maxSize, (value, key, reason) => {
    if (value.url) {
      try {
        URL.revokeObjectURL(value.url);
        debugLog(`Blob URL revoked - ${reason}`);
      } catch (error) {
        console.warn(`Failed to revoke blob URL (${reason}):`, error);
      }
    }
  });
}

export function useLRUCache<K, V>(
  maxSize = 10,
  cleanupFn?: (value: V, key: K, reason: string) => void,
): LRUCache<K, V> {
  const cacheRef = useRef<LRUCache<K, V> | null>(null);

  if (!cacheRef.current) {
    cacheRef.current = new LRUCache(maxSize, cleanupFn);
  }

  // 组件卸载时自动清理所有缓存
  useEffect(() => {
    return () => {
      cacheRef.current?.clear();
    };
  }, []);

  return cacheRef.current;
}
