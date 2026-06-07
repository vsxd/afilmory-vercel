import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "./thumbnail-load-cache";

export function getGalleryThumbnailCacheKey(
  photoId: string,
  thumbnailUrl: string | null | undefined,
): string {
  return getThumbnailLoadCacheKey(photoId, thumbnailUrl);
}

export function hasLoadedGalleryThumbnail(cacheKey: string): boolean {
  return hasLoadedThumbnail(cacheKey);
}

export function markGalleryThumbnailLoaded(cacheKey: string): void {
  markThumbnailLoaded(cacheKey);
}

export function resetGalleryThumbnailCache(): void {
  resetThumbnailLoadCache();
}
