import {
  applyLocationPrivacy,
  applyPhotoLocationPrivacy,
  locationPrivacyFingerprint,
} from "@afilmory/schema";

import type {
  LocationInfo,
  PhotoManifestItem,
  PickedExif,
} from "../types/photo.js";
import { parseGPSCoordinates } from "./geocoding-gps.js";
import type { LocationMode } from "./processing-fingerprints.js";

export {
  applyExifLocationPrivacy,
  applyLocationPrivacy as applyManifestLocationPrivacy,
  COARSE_LOCATION_DECIMAL_PLACES,
} from "@afilmory/schema";

/**
 * Reconcile derived locations with the current privacy-filtered EXIF. Labels
 * belong to coordinates, so a changed or removed GPS fix cannot keep the old
 * administrative names, including when reverse geocoding is disabled/offline.
 */
export function reconcilePhotoLocation(
  existingItem: Pick<PhotoManifestItem, "location" | "exif"> | undefined,
  exif: PickedExif | null,
  mode: LocationMode,
  privacyModeChanged: boolean,
  contentChanged: boolean,
): LocationInfo | null {
  if (mode === "strip") return null;
  const existingLocation = existingItem?.location ?? null;

  const { latitude, longitude } = parseGPSCoordinates(exif ?? {});
  if (latitude === undefined || longitude === undefined) {
    const previousGPS = parseGPSCoordinates(existingItem?.exif ?? {});
    // A location supplied by a plugin may never have had source GPS. Preserve
    // that value unless GPS was actually removed or the privacy policy changed.
    return privacyModeChanged ||
      (previousGPS.latitude !== undefined &&
        previousGPS.longitude !== undefined)
      ? null
      : applyLocationPrivacy(existingLocation, mode);
  }
  // Initial coordinates still follow the existing geocoding publication path.
  if (!existingLocation && !privacyModeChanged) return null;
  const reusableLocation = applyLocationPrivacy(existingLocation, mode);
  const sameCoordinates =
    reusableLocation?.latitude === latitude &&
    reusableLocation.longitude === longitude;
  // A policy-only change may restore precision from the same source. Its
  // labels remain reusable; a simultaneous source change must compare GPS.
  const reuseLabels =
    sameCoordinates || (privacyModeChanged && !contentChanged);
  return {
    ...(reuseLabels ? reusableLocation : {}),
    latitude,
    longitude,
  };
}

/** Apply the policy at the publication boundary, including fallback items. */
export function enforcePhotoLocationPrivacy(
  item: PhotoManifestItem,
  mode: LocationMode,
): void {
  const hadProcessingMetadata = item.processing !== undefined;
  const previousPrivacy = item.processing?.privacy;
  const previousMode = previousPrivacy?.match(
    /^location-privacy:v\d+:(strip|coarse|exact)/,
  )?.[1] as LocationMode | undefined;
  const sanitized = applyPhotoLocationPrivacy(item, mode);
  item.exif = sanitized.exif;
  item.location = sanitized.location;
  const processing = sanitized.processing ?? {};
  item.processing = processing;

  // Redaction can only move data toward less precision without source bytes.
  // 发布层可以从三种前置状态推导出当前目标：strip 目标（删光总是可行）、
  // exact 来源（保留了全部源级数据）、指纹完全一致（同模式同版本同参数）。
  // 其余组合（含同为 coarse 但旧版本/旧精度——取整不可逆，无法凭发布数据
  // 提高精度）都必须保留旧指纹，让下一次健康的增量构建重走源文件提取。
  const canDeriveTarget =
    mode === "strip" ||
    previousMode === "exact" ||
    previousPrivacy === locationPrivacyFingerprint(mode);
  if (!canDeriveTarget) {
    if (previousPrivacy) {
      processing.privacy = previousPrivacy;
    } else {
      delete processing.privacy;
    }
    if (!hadProcessingMetadata && Object.keys(processing).length === 0) {
      delete item.processing;
    }
  }
}
