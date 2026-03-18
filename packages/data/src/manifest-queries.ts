import type { PhotoManifestItem } from './types'

export function createPhotoMap(photos: PhotoManifestItem[]): Record<string, PhotoManifestItem> {
  return photos.reduce<Record<string, PhotoManifestItem>>((acc, photo) => {
    if (photo?.id) {
      acc[photo.id] = photo
    }
    return acc
  }, {})
}

export function collectSortedTags(photos: PhotoManifestItem[]): string[] {
  const tagSet = new Set<string>()
  for (const photo of photos) {
    for (const tag of photo.tags) {
      tagSet.add(tag)
    }
  }

  return [...tagSet].sort()
}
