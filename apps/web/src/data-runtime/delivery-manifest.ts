import type {
  AfilmoryManifest,
  LocationAdminInfo,
  LocationInfo,
  PhotoManifestItem,
  PickedExif,
  ToneAnalysis,
  VideoSource,
} from "@afilmory/schema";
import { parseManifestLenient } from "@afilmory/schema";

export const WEB_DELIVERY_MANIFEST_SCHEMA = "afilmory-web-delivery";
export const WEB_DELIVERY_MANIFEST_VERSION = 3 as const;

export interface WebPhotoDetail {
  exif: PickedExif | null;
  toneAnalysis: ToneAnalysis | null;
  location: LocationInfo | null;
  video?: VideoSource;
  isHDR?: boolean;
}

export interface WebPhotoDetailShard {
  schema: typeof WEB_DELIVERY_MANIFEST_SCHEMA;
  version: typeof WEB_DELIVERY_MANIFEST_VERSION;
  kind: "photo-details";
  photos: Record<string, WebPhotoDetail>;
}

export interface WebMapPhotoDetail {
  location: LocationInfo | null;
  exif: Pick<
    PickedExif,
    | "GPSAltitude"
    | "GPSAltitudeRef"
    | "GPSLatitude"
    | "GPSLatitudeRef"
    | "GPSLongitude"
    | "GPSLongitudeRef"
  > | null;
}

export interface WebMapDetailShard {
  schema: typeof WEB_DELIVERY_MANIFEST_SCHEMA;
  version: typeof WEB_DELIVERY_MANIFEST_VERSION;
  kind: "map-details";
  photos: Record<string, WebMapPhotoDetail>;
}

export interface WebDeliveryShardReference {
  url: string;
  photoIds: string[];
}

export interface WebDeliveryRuntimeShardReference extends WebDeliveryShardReference {
  /** Raw manifest photos discarded by lenient parsing but still present in this asset. */
  ignoredPhotoIds?: string[];
}

export interface WebDeliveryManifest {
  schema: typeof WEB_DELIVERY_MANIFEST_SCHEMA;
  version: typeof WEB_DELIVERY_MANIFEST_VERSION;
  kind: "gallery-index";
  manifest: AfilmoryManifest;
  delivery: {
    detailShards: WebDeliveryShardReference[];
    mapUrl?: string;
  };
}

export interface WebDeliveryRuntimeDescriptor {
  detailShards: WebDeliveryRuntimeShardReference[];
  mapUrl?: string;
  /** Discarded raw manifest photos that map assets may safely ignore. */
  ignoredPhotoIds?: string[];
}

export interface ParsedWebDeliveryManifest {
  manifest: AfilmoryManifest;
  delivery: WebDeliveryRuntimeDescriptor;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(value, key);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

const isStringOrFiniteNumber = (value: unknown): value is string | number =>
  typeof value === "string" || isFiniteNumber(value);

const isSafeAssetUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.startsWith("/assets/")) return false;
  try {
    const url = new URL(value, "https://afilmory.invalid");
    return (
      url.origin === "https://afilmory.invalid" &&
      url.pathname.startsWith("/assets/") &&
      !url.pathname.includes("..") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

function collectRawManifestPhotoIds(value: unknown): Set<string> {
  if (!isRecord(value) || !Array.isArray(value.photos)) return new Set();
  return new Set(
    value.photos.flatMap((photo) =>
      isRecord(photo) && typeof photo.id === "string" && photo.id.length > 0
        ? [photo.id]
        : [],
    ),
  );
}

function parseShardReferences(
  value: unknown,
  knownPhotoIds: ReadonlySet<string>,
  rawManifestPhotoIds: ReadonlySet<string>,
): WebDeliveryRuntimeShardReference[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Web delivery manifest detailShards must be an array.");
  }

  const seenPhotoIds = new Set<string>();
  const seenAssignedPhotoIds = new Set<string>();
  const seenShardUrls = new Set<string>();
  const references = value.flatMap((entry, index) => {
    if (!isRecord(entry) || !isSafeAssetUrl(entry.url)) {
      throw new Error(`Invalid web delivery detail shard at index ${index}.`);
    }
    if (seenShardUrls.has(entry.url)) {
      throw new Error(`Web delivery detail shard ${entry.url} is duplicated.`);
    }
    seenShardUrls.add(entry.url);
    if (
      !Array.isArray(entry.photoIds) ||
      entry.photoIds.some((photoId) => typeof photoId !== "string" || !photoId)
    ) {
      throw new Error(
        `Invalid photo id list for web delivery detail shard ${entry.url}.`,
      );
    }
    const photoIds: string[] = [];
    const ignoredPhotoIds: string[] = [];
    for (const photoId of entry.photoIds as string[]) {
      if (seenAssignedPhotoIds.has(photoId)) {
        throw new Error(
          `Photo ${photoId} is assigned to multiple detail shards.`,
        );
      }
      seenAssignedPhotoIds.add(photoId);
      if (!knownPhotoIds.has(photoId)) {
        // A lenient manifest parse may discard one unusable photo. Its shard
        // reference was valid when the delivery assets were produced, so it
        // must be discarded with that photo. An ID absent from the raw
        // manifest is genuinely foreign and remains a hard integrity error.
        if (rawManifestPhotoIds.has(photoId)) {
          ignoredPhotoIds.push(photoId);
          continue;
        }
        throw new Error(
          `Detail shard ${entry.url} references unknown photo ${photoId}.`,
        );
      }
      seenPhotoIds.add(photoId);
      photoIds.push(photoId);
    }
    return photoIds.length > 0 || ignoredPhotoIds.length > 0
      ? [
          {
            url: entry.url,
            photoIds,
            ...(ignoredPhotoIds.length > 0 ? { ignoredPhotoIds } : {}),
          },
        ]
      : [];
  });

  for (const photoId of knownPhotoIds) {
    if (!seenPhotoIds.has(photoId)) {
      throw new Error(`Photo ${photoId} is not assigned to a detail shard.`);
    }
  }

  return references;
}

export function parseWebDeliveryManifest(
  input: unknown,
): ParsedWebDeliveryManifest | null {
  if (!isRecord(input) || input.schema !== WEB_DELIVERY_MANIFEST_SCHEMA) {
    return null;
  }
  if (
    input.version !== WEB_DELIVERY_MANIFEST_VERSION ||
    input.kind !== "gallery-index" ||
    !isRecord(input.delivery)
  ) {
    throw new Error("Unsupported Afilmory web delivery manifest.");
  }

  const rawManifestPhotoIds = collectRawManifestPhotoIds(input.manifest);
  const { manifest, skipped } = parseManifestLenient(input.manifest);
  if (skipped.length > 0) {
    console.warn(
      `[manifest] Skipped ${skipped.length} invalid gallery index photo(s).`,
      skipped,
    );
  }

  const knownPhotoIds = new Set(manifest.photos.map((photo) => photo.id));
  const ignoredPhotoIds = [...rawManifestPhotoIds].filter(
    (photoId) => !knownPhotoIds.has(photoId),
  );
  const detailShards = parseShardReferences(
    input.delivery.detailShards,
    knownPhotoIds,
    rawManifestPhotoIds,
  );

  const rawMapUrl = input.delivery.mapUrl;
  if (rawMapUrl !== undefined && !isSafeAssetUrl(rawMapUrl)) {
    throw new Error("Invalid web delivery map shard URL.");
  }

  return {
    manifest,
    delivery: {
      detailShards,
      ...(rawMapUrl ? { mapUrl: rawMapUrl } : {}),
      ...(ignoredPhotoIds.length > 0 ? { ignoredPhotoIds } : {}),
    },
  };
}

const TONE_TYPES: ReadonlySet<ToneAnalysis["toneType"]> = new Set([
  "low-key",
  "high-key",
  "normal",
  "high-contrast",
]);

const isToneType = (value: unknown): value is ToneAnalysis["toneType"] =>
  typeof value === "string" &&
  TONE_TYPES.has(value as ToneAnalysis["toneType"]);

function parseExif(value: unknown, context: string): PickedExif | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`${context} exif must be null or an object.`);
  }

  const ancestors = new WeakSet<object>();
  const isSafeExifValue = (item: unknown, depth: number): boolean => {
    if (
      item === null ||
      item === undefined ||
      typeof item === "string" ||
      typeof item === "boolean"
    ) {
      return true;
    }
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item !== "object" || depth >= 32 || ancestors.has(item)) {
      return false;
    }
    if (!Array.isArray(item)) {
      const prototype: unknown = Object.getPrototypeOf(item);
      if (prototype !== null && prototype !== Object.prototype) return false;
    }
    ancestors.add(item);
    const safe = Object.entries(item).every(
      ([key, nested]) =>
        key !== "__proto__" &&
        key !== "constructor" &&
        key !== "prototype" &&
        isSafeExifValue(nested, depth + 1),
    );
    ancestors.delete(item);
    return safe;
  };

  if (!isSafeExifValue(value, 0)) {
    throw new Error(`${context} exif contains an invalid value.`);
  }
  return value as PickedExif;
}

function parseToneAnalysis(
  value: unknown,
  context: string,
): ToneAnalysis | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isToneType(value.toneType) ||
    !isFiniteNumber(value.brightness) ||
    value.brightness < 0 ||
    value.brightness > 100 ||
    !isFiniteNumber(value.contrast) ||
    value.contrast < 0 ||
    value.contrast > 100 ||
    !isFiniteNumber(value.shadowRatio) ||
    value.shadowRatio < 0 ||
    value.shadowRatio > 1 ||
    !isFiniteNumber(value.highlightRatio) ||
    value.highlightRatio < 0 ||
    value.highlightRatio > 1
  ) {
    throw new Error(`${context} toneAnalysis is invalid.`);
  }
  return {
    toneType: value.toneType,
    brightness: value.brightness,
    contrast: value.contrast,
    shadowRatio: value.shadowRatio,
    highlightRatio: value.highlightRatio,
  };
}

const ADMIN_FIELDS = [
  "country",
  "countryCode",
  "region",
  "city",
  "district",
] as const;

function isAdminInfo(value: unknown): value is LocationAdminInfo {
  return (
    isRecord(value) &&
    ADMIN_FIELDS.every(
      (key) => !hasOwn(value, key) || typeof value[key] === "string",
    )
  );
}

function parseLocation(value: unknown, context: string): LocationInfo | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !isFiniteNumber(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    throw new Error(`${context} location is invalid.`);
  }

  for (const key of ["admin", "adminKey"] as const) {
    if (hasOwn(value, key) && !isAdminInfo(value[key])) {
      throw new Error(`${context} location.${key} is invalid.`);
    }
  }
  if (
    hasOwn(value, "adminI18n") &&
    (!isRecord(value.adminI18n) ||
      !Object.values(value.adminI18n).every(isAdminInfo))
  ) {
    throw new Error(`${context} location.adminI18n is invalid.`);
  }
  for (const key of ["country", "city", "locationName"] as const) {
    if (hasOwn(value, key) && typeof value[key] !== "string") {
      throw new Error(`${context} location.${key} is invalid.`);
    }
  }
  if (
    hasOwn(value, "locationNameI18n") &&
    (!isRecord(value.locationNameI18n) ||
      !Object.values(value.locationNameI18n).every(
        (item) => typeof item === "string",
      ))
  ) {
    throw new Error(`${context} location.locationNameI18n is invalid.`);
  }

  const location: LocationInfo = {
    latitude: value.latitude,
    longitude: value.longitude,
  };
  if (isAdminInfo(value.admin)) location.admin = { ...value.admin };
  if (isRecord(value.adminI18n)) {
    location.adminI18n = Object.fromEntries(
      Object.entries(value.adminI18n).map(([locale, admin]) => [
        locale,
        { ...(admin as LocationAdminInfo) },
      ]),
    );
  }
  if (isAdminInfo(value.adminKey)) location.adminKey = { ...value.adminKey };
  if (typeof value.country === "string") location.country = value.country;
  if (typeof value.city === "string") location.city = value.city;
  if (typeof value.locationName === "string") {
    location.locationName = value.locationName;
  }
  if (isRecord(value.locationNameI18n)) {
    location.locationNameI18n = Object.fromEntries(
      Object.entries(value.locationNameI18n).map(([locale, name]) => [
        locale,
        name as string,
      ]),
    );
  }
  return location;
}

function parseVideo(value: unknown, context: string): VideoSource {
  if (!isRecord(value)) {
    throw new Error(`${context} video must be an object.`);
  }
  if (value.type === "live-photo") {
    if (
      typeof value.videoUrl !== "string" ||
      value.videoUrl.length === 0 ||
      typeof value.s3Key !== "string" ||
      value.s3Key.length === 0 ||
      (hasOwn(value, "version") && typeof value.version !== "string")
    ) {
      throw new Error(`${context} Live Photo video is invalid.`);
    }
    return {
      type: "live-photo",
      videoUrl: value.videoUrl,
      s3Key: value.s3Key,
      ...(typeof value.version === "string" ? { version: value.version } : {}),
    };
  }
  if (value.type === "motion-photo") {
    if (
      !isNonNegativeNumber(value.offset) ||
      (hasOwn(value, "size") && !isNonNegativeNumber(value.size)) ||
      (hasOwn(value, "presentationTimestamp") &&
        !isNonNegativeNumber(value.presentationTimestamp))
    ) {
      throw new Error(`${context} Motion Photo video is invalid.`);
    }
    return {
      type: "motion-photo",
      offset: value.offset,
      ...(isNonNegativeNumber(value.size) ? { size: value.size } : {}),
      ...(isNonNegativeNumber(value.presentationTimestamp)
        ? { presentationTimestamp: value.presentationTimestamp }
        : {}),
    };
  }
  throw new Error(`${context} video type is invalid.`);
}

function parseDetailRecord(value: unknown, photoId: string): WebPhotoDetail {
  if (!isRecord(value)) {
    throw new Error(`Invalid photo detail record for ${photoId}.`);
  }
  const context = `Photo detail ${photoId}`;
  if (
    !hasOwn(value, "exif") ||
    !hasOwn(value, "toneAnalysis") ||
    !hasOwn(value, "location")
  ) {
    throw new Error(`${context} is missing required fields.`);
  }
  if (hasOwn(value, "isHDR") && typeof value.isHDR !== "boolean") {
    throw new Error(`${context} isHDR must be a boolean.`);
  }
  return {
    exif: parseExif(value.exif, context),
    toneAnalysis: parseToneAnalysis(value.toneAnalysis, context),
    location: parseLocation(value.location, context),
    ...(hasOwn(value, "video")
      ? { video: parseVideo(value.video, context) }
      : {}),
    ...(typeof value.isHDR === "boolean" ? { isHDR: value.isHDR } : {}),
  };
}

export function parseWebPhotoDetailShard(
  input: unknown,
): Record<string, WebPhotoDetail> {
  if (
    !isRecord(input) ||
    input.schema !== WEB_DELIVERY_MANIFEST_SCHEMA ||
    input.version !== WEB_DELIVERY_MANIFEST_VERSION ||
    input.kind !== "photo-details" ||
    !isRecord(input.photos)
  ) {
    throw new Error("Invalid Afilmory photo detail shard.");
  }
  return Object.fromEntries(
    Object.entries(input.photos).map(([photoId, value]) => {
      if (!photoId) throw new Error("Photo detail shard contains an empty id.");
      return [photoId, parseDetailRecord(value, photoId)];
    }),
  );
}

const MAP_EXIF_VALUE_TYPES = {
  GPSAltitude: isStringOrFiniteNumber,
  GPSAltitudeRef: isStringOrFiniteNumber,
  GPSLatitude: isStringOrFiniteNumber,
  GPSLatitudeRef: (value: unknown): value is string =>
    typeof value === "string",
  GPSLongitude: isStringOrFiniteNumber,
  GPSLongitudeRef: (value: unknown): value is string =>
    typeof value === "string",
} as const;

function parseMapExif(
  value: unknown,
  context: string,
): WebMapPhotoDetail["exif"] {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`${context} exif must be null or an object.`);
  }
  for (const [key, item] of Object.entries(value)) {
    const guard =
      MAP_EXIF_VALUE_TYPES[key as keyof typeof MAP_EXIF_VALUE_TYPES];
    if (!guard || !guard(item)) {
      throw new Error(`${context} exif.${key} is invalid.`);
    }
  }
  return value as WebMapPhotoDetail["exif"];
}

export function parseWebMapDetailShard(
  input: unknown,
): Record<string, WebMapPhotoDetail> {
  if (
    !isRecord(input) ||
    input.schema !== WEB_DELIVERY_MANIFEST_SCHEMA ||
    input.version !== WEB_DELIVERY_MANIFEST_VERSION ||
    input.kind !== "map-details" ||
    !isRecord(input.photos)
  ) {
    throw new Error("Invalid Afilmory map detail shard.");
  }

  return Object.fromEntries(
    Object.entries(input.photos).map(([photoId, value]) => {
      if (!photoId || !isRecord(value)) {
        throw new Error(`Invalid map detail for photo ${photoId}.`);
      }
      const context = `Map detail ${photoId}`;
      if (!hasOwn(value, "location") || !hasOwn(value, "exif")) {
        throw new Error(`${context} is missing required fields.`);
      }
      return [
        photoId,
        {
          location: parseLocation(value.location, context),
          exif: parseMapExif(value.exif, context),
        },
      ];
    }),
  );
}

export function mergePhotoDetail(
  target: PhotoManifestItem,
  detail: WebPhotoDetail,
): void {
  target.exif = detail.exif;
  target.toneAnalysis = detail.toneAnalysis;
  target.location = detail.location;
  if (detail.video) target.video = detail.video;
  else delete target.video;
  if (typeof detail.isHDR === "boolean") target.isHDR = detail.isHDR;
  else delete target.isHDR;
}
