export function buildPhotoDetailPathname(photoId: string): string {
  return `/photos/${encodeURIComponent(photoId)}`;
}
