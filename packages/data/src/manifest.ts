import type { AfilmoryManifest, PhotoManifestItem } from "./types";
import { CURRENT_MANIFEST_VERSION } from "./version";

export function createEmptyManifest(): AfilmoryManifest {
  return {
    version: CURRENT_MANIFEST_VERSION,
    data: [],
    cameras: [],
    lenses: [],
  };
}

function stripUnsupportedExifFields(photo: unknown): unknown {
  if (!photo || typeof photo !== "object") {
    return photo;
  }

  const { exif } = photo as { exif?: unknown };

  if (!exif || typeof exif !== "object" || !("Rating" in exif)) {
    return photo;
  }

  const normalizedPhoto = photo as Record<string, unknown>;
  const normalizedExif = { ...(exif as Record<string, unknown>) };
  delete normalizedExif.Rating;

  return {
    ...normalizedPhoto,
    exif: normalizedExif,
  };
}

function normalizePhotos(data: unknown[]): PhotoManifestItem[] {
  return data.map((photo) =>
    stripUnsupportedExifFields(photo),
  ) as PhotoManifestItem[];
}

export function parseManifest(input?: unknown): AfilmoryManifest {
  if (!input || typeof input !== "object") {
    return createEmptyManifest();
  }

  const manifest = input as Partial<AfilmoryManifest>;

  return {
    version:
      typeof manifest.version === "string"
        ? manifest.version
        : CURRENT_MANIFEST_VERSION,
    data: Array.isArray(manifest.data) ? normalizePhotos(manifest.data) : [],
    cameras: Array.isArray(manifest.cameras) ? manifest.cameras : [],
    lenses: Array.isArray(manifest.lenses) ? manifest.lenses : [],
  };
}
