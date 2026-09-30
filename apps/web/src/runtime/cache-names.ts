export const AFILMORY_RUNTIME_CACHE_NAMES = {
  galleryIndexes: "afilmory-gallery-indexes-v1",
  manifestShards: "afilmory-manifest-shards-v1",
  originalImages: "afilmory-original-images-v2",
  staticAssets: "afilmory-static-assets-v1",
  thumbnails: "afilmory-thumbnails-v2",
} as const;

const AFILMORY_RUNTIME_CACHE_NAME_SET = new Set<string>([
  ...Object.values(AFILMORY_RUNTIME_CACHE_NAMES),
  // Previous releases used these names. Keep recognizing them so recovery
  // and upgrades can remove the orphaned caches after the self-hosted font
  // and content-addressed thumbnail migrations. The video cache was removed:
  // normal media playback starts with byte-range responses, so the old
  // CacheFirst rule never acquired the full response it required.
  "afilmory-videos-v1",
  "google-fonts-cache",
  "gstatic-fonts-cache",
  "images-cache",
  "s3-images-cache",
]);

export function isAfilmoryRuntimeCacheName(name: string): boolean {
  return (
    AFILMORY_RUNTIME_CACHE_NAME_SET.has(name) ||
    name.startsWith("workbox-") ||
    name.includes("precache")
  );
}
