// 照片详情路由形如 /photos/:photoId（单段，photoId 已编码，不含 "/"）。
const PHOTO_DETAIL_PATHNAME_PATTERN = /^\/photos\/[^/]+\/?$/;

export function buildPhotoDetailPathname(photoId: string): string {
  return `/photos/${encodeURIComponent(photoId)}`;
}

export function isPhotoDetailPathname(pathname: string): boolean {
  return PHOTO_DETAIL_PATHNAME_PATTERN.test(pathname);
}
