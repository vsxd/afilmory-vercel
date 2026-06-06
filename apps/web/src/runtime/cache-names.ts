export const AFILMORY_RUNTIME_CACHE_NAMES = [
  "google-fonts-cache",
  "gstatic-fonts-cache",
  "images-cache",
  "s3-images-cache",
] as const;

const AFILMORY_RUNTIME_CACHE_NAME_SET = new Set<string>(
  AFILMORY_RUNTIME_CACHE_NAMES,
);

export function isAfilmoryRuntimeCacheName(name: string): boolean {
  return (
    AFILMORY_RUNTIME_CACHE_NAME_SET.has(name) ||
    name.startsWith("workbox-") ||
    name.includes("precache")
  );
}
