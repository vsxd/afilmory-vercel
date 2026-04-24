export function encodeStorageKeyForUrl(key: string): string {
  return key
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function joinPublicUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${encodeStorageKeyForUrl(key)}`
}
