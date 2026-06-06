export interface GalleryVirtualPhotoTargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

type GalleryVirtualPhotoTargetResolver = (
  photoId: string,
) => GalleryVirtualPhotoTargetRect | null;

let galleryVirtualPhotoTargetResolver: GalleryVirtualPhotoTargetResolver | null =
  null;

export const setGalleryVirtualPhotoTargetResolver = (
  resolver: GalleryVirtualPhotoTargetResolver | null,
) => {
  galleryVirtualPhotoTargetResolver = resolver;
};

export const getGalleryVirtualPhotoTargetRect = (photoId: string) => {
  return galleryVirtualPhotoTargetResolver?.(photoId) ?? null;
};
