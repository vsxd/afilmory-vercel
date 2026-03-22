import type { PhotoManifestItem } from '@afilmory/data'

/**
 * Extract a Date object from a photo's EXIF DateTimeOriginal or lastModified.
 * EXIF date format: "YYYY:MM:DD HH:mm:ss" or ISO string
 */
export function getPhotoDate(photo: PhotoManifestItem): Date {
  if (photo.exif?.DateTimeOriginal) {
    const dateStr = photo.exif.DateTimeOriginal
    // EXIF date format "YYYY:MM:DD HH:mm:ss" → "YYYY-MM-DD HH:mm:ss"
    const formattedDateStr = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    const date = new Date(formattedDateStr)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }
  return new Date(photo.lastModified)
}

/**
 * Get a sortable date string from a photo (for locale comparison sorting).
 */
export function getPhotoDateString(photo: PhotoManifestItem): string {
  return photo.exif?.DateTimeOriginal ?? photo.lastModified
}
