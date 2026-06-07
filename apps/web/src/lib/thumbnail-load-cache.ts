const loadedThumbnails = new Set<string>();

export function getThumbnailLoadCacheKey(
  photoId: string,
  src: string | null | undefined,
): string {
  return src || photoId;
}

export function hasLoadedThumbnail(cacheKey: string): boolean {
  return loadedThumbnails.has(cacheKey);
}

export function markThumbnailLoaded(cacheKey: string): void {
  loadedThumbnails.add(cacheKey);
}

export function resetThumbnailLoadCache(): void {
  loadedThumbnails.clear();
}
