import type { TFunction } from "i18next";

import type { PhotoManifest } from "~/types/photo";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatPhotoDate(locale: string, dateTaken?: string): string | null {
  if (!dateTaken) return null;
  const date = new Date(dateTaken);
  if (Number.isNaN(date.getTime())) return null;

  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(date);
}

/**
 * One accessible naming policy shared by the gallery, viewer, and map.
 * Storage identifiers are deliberately not exposed as human-facing labels.
 */
export function getPhotoAccessibleLabel(
  photo: Pick<PhotoManifest, "title" | "description" | "dateTaken">,
  t: TFunction,
  locale: string,
): string {
  const authoredLabel = photo.title?.trim() || photo.description?.trim();
  if (authoredLabel) return authoredLabel;

  const takenDate = formatPhotoDate(locale, photo.dateTaken);
  return takenDate
    ? String(t("photo.untitled.taken-on", { date: takenDate }))
    : String(t("photo.untitled.fallback"));
}
