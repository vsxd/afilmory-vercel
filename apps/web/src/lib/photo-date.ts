import type { PhotoManifest } from "~/types/photo";

/**
 * Extract a Date object from the builder's canonical dateTaken field, with raw
 * EXIF and object lastModified retained only as compatibility fallbacks.
 * EXIF date format: "YYYY:MM:DD HH:mm:ss" or ISO string
 */
export function getPhotoDate(photo: PhotoManifest): Date {
  const canonicalDate = new Date(photo.dateTaken);
  if (!Number.isNaN(canonicalDate.getTime())) {
    return canonicalDate;
  }

  if (photo.exif?.DateTimeOriginal) {
    const dateStr = photo.exif.DateTimeOriginal;
    // EXIF date format "YYYY:MM:DD HH:mm:ss" → "YYYY-MM-DD HH:mm:ss"
    const formattedDateStr = dateStr.replace(
      /^(\d{4}):(\d{2}):(\d{2})/,
      "$1-$2-$3",
    );
    const date = new Date(formattedDateStr);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(photo.lastModified);
}

// 排序时每张照片会被比较 O(log n) 次，按 manifest item 标识备忘解析结果。
const photoSortTimeCache = new WeakMap<PhotoManifest, number>();

/**
 * Millisecond timestamp for sorting photos by date. Goes through getPhotoDate
 * so raw-EXIF ("YYYY:MM:DD HH:mm:ss") and ISO dates order consistently;
 * unparsable dates collapse to 0 to keep the comparator consistent.
 */
export function getPhotoSortTime(photo: PhotoManifest): number {
  let time = photoSortTimeCache.get(photo);
  if (time === undefined) {
    const parsed = getPhotoDate(photo).getTime();
    time = Number.isNaN(parsed) ? 0 : parsed;
    photoSortTimeCache.set(photo, time);
  }
  return time;
}
