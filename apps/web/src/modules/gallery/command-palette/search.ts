import type { LocationAdminInfo } from "@afilmory/schema";

import type { PhotoManifest } from "~/types/photo";

export interface PhotoSearchEntry {
  photo: PhotoManifest;
  searchText: string;
}

const getLocationTokens = (
  location?: {
    locationName?: string | null;
    locationNameI18n?: Record<string, string | null | undefined> | null;
    city?: string | null;
    country?: string | null;
    admin?: LocationAdminInfo | null;
    adminI18n?: Record<string, LocationAdminInfo | null | undefined> | null;
    adminKey?: LocationAdminInfo | null;
  } | null,
) => {
  if (!location) return [];

  const localizedAdminTokens = Object.values(location.adminI18n ?? {}).flatMap(
    (admin) => [
      admin?.country,
      admin?.countryCode,
      admin?.region,
      admin?.city,
      admin?.district,
    ],
  );

  const tokens = [
    location.locationName,
    ...Object.values(location.locationNameI18n ?? {}),
    location.city,
    location.country,
    location.admin?.country,
    location.admin?.countryCode,
    location.admin?.region,
    location.admin?.city,
    location.admin?.district,
    location.adminKey?.country,
    location.adminKey?.countryCode,
    location.adminKey?.region,
    location.adminKey?.city,
    location.adminKey?.district,
    ...localizedAdminTokens,
  ]
    .map((token) => token?.trim())
    .filter(
      (token): token is string => typeof token === "string" && token.length > 0,
    );

  const uniqueTokens: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueTokens.push(token);
    }
  }

  return uniqueTokens;
};

export const fuzzyMatch = (text: string, query: string): boolean => {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText.includes(lowerQuery)) return true;

  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
};

export const searchPhotos = (
  photos: readonly PhotoManifest[],
  query: string,
) => {
  return searchPhotoIndex(buildPhotoSearchIndex(photos), query);
};

export const buildPhotoSearchIndex = (
  photos: readonly PhotoManifest[],
): PhotoSearchEntry[] =>
  photos.map((photo) => ({
    photo,
    searchText: [
      photo.title,
      photo.description,
      ...(photo.tags ?? []),
      photo.exif?.Make,
      photo.exif?.Model,
      photo.exif?.LensModel,
      ...getLocationTokens(photo.location),
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\u0000")
      .toLowerCase(),
  }));

export const searchPhotoIndex = (
  index: PhotoSearchEntry[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): readonly PhotoManifest[] => {
  // Search is language-agnostic metadata matching. The host's default locale
  // must not change ASCII case folding (notably I/i on Turkish systems).
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || limit <= 0) return [];

  const matches: PhotoManifest[] = [];
  for (const entry of index) {
    if (!entry.searchText.includes(normalizedQuery)) continue;
    matches.push(entry.photo);
    if (matches.length >= limit) break;
  }
  return matches;
};

export { getLocationTokens };
