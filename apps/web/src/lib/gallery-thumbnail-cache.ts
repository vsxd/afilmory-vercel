const loadedGalleryThumbnails = new Set<string>();

export function getGalleryThumbnailCacheKey(
  photoId: string,
  thumbnailUrl: string | null | undefined,
): string {
  return thumbnailUrl || photoId;
}

export function hasLoadedGalleryThumbnail(cacheKey: string): boolean {
  return loadedGalleryThumbnails.has(cacheKey);
}

export function markGalleryThumbnailLoaded(cacheKey: string): void {
  loadedGalleryThumbnails.add(cacheKey);
}

export function resetGalleryThumbnailCache(): void {
  loadedGalleryThumbnails.clear();
}
