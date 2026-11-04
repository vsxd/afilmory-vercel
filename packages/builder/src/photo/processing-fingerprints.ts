import { locationPrivacyFingerprint } from "@afilmory/schema";

import { DISPLAY_IMAGE_SIGNATURE } from "../image/display-images.js";
import type {
  PhotoManifestItem,
  PhotoProcessingFingerprints,
} from "../types/photo.js";

/**
 * Bump only the stage whose output contract or algorithm changed. This keeps
 * incremental rebuilds precise instead of turning every builder upgrade into
 * an unconditional full rebuild.
 */
export interface CoreProcessingFingerprints {
  thumbnail: string;
  displayImages: string;
  exif: string;
  tone: string;
  media: string;
  privacy: string;
}

export const CURRENT_CORE_PROCESSING_FINGERPRINTS: Readonly<CoreProcessingFingerprints> =
  Object.freeze({
    // Encoding parameters also have a global on-disk marker; this stage version
    // covers changes to the per-photo thumbnail/thumbhash contract itself.
    thumbnail: "thumbnail:v2",
    displayImages: DISPLAY_IMAGE_SIGNATURE,
    exif: "exif:v2",
    tone: "tone:v2",
    media: "media-detection:v2",
    // 与发布层盖章（applyPhotoLocationPrivacy）共用同一来源，两边失同步会
    // 造成永久增量空转或永久重建循环。
    privacy: locationPrivacyFingerprint("coarse"),
  }) satisfies Readonly<PhotoProcessingFingerprints>;

export type CoreProcessingStage = keyof CoreProcessingFingerprints;

export type LocationMode = "strip" | "coarse" | "exact";

export function getCurrentCoreProcessingFingerprints(
  locationMode: LocationMode = "coarse",
): CoreProcessingFingerprints {
  return {
    ...CURRENT_CORE_PROCESSING_FINGERPRINTS,
    privacy: locationPrivacyFingerprint(locationMode),
  };
}

export function getStaleCoreProcessingStages(
  item: PhotoManifestItem | undefined,
  locationMode: LocationMode = "coarse",
): ReadonlySet<CoreProcessingStage> {
  const current = getCurrentCoreProcessingFingerprints(locationMode);
  if (!item) {
    return new Set(Object.keys(current) as CoreProcessingStage[]);
  }

  const stale = new Set<CoreProcessingStage>();
  for (const [stage, fingerprint] of Object.entries(current) as Array<
    [CoreProcessingStage, string]
  >) {
    if (item.processing?.[stage] !== fingerprint) stale.add(stage);
  }
  return stale;
}

export function hasStaleCoreProcessingStages(
  item: PhotoManifestItem | undefined,
  locationMode: LocationMode = "coarse",
): boolean {
  return getStaleCoreProcessingStages(item, locationMode).size > 0;
}
