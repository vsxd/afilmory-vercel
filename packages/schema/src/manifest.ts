import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  LocationAdminInfo,
  LocationInfo,
  ManifestSource,
  PhotoManifestItem,
  PickedExif,
  ToneAnalysis,
  ToneType,
  VideoSource,
} from "./types.ts";
import {
  AFILMORY_MANIFEST_SCHEMA,
  CURRENT_MANIFEST_VERSION,
} from "./version.ts";

const UNKNOWN_SOURCE: ManifestSource = { provider: "unknown" };
const VALID_TONE_TYPES = new Set<ToneType>([
  "low-key",
  "high-key",
  "normal",
  "high-contrast",
]);

export class ManifestValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid Afilmory manifest: ${issues.join("; ")}`);
    this.name = "ManifestValidationError";
    this.issues = issues;
  }
}

export type ManifestValidationResult =
  | {
      success: true;
      manifest: AfilmoryManifest;
    }
  | {
      success: false;
      issues: string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function pushIssue(
  issues: string[],
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    issues.push(message);
  }
}

function normalizeSource(value: unknown): ManifestSource {
  if (!isRecord(value)) return UNKNOWN_SOURCE;
  if (value.provider !== "s3") return UNKNOWN_SOURCE;

  return {
    provider: "s3",
    bucket: typeof value.bucket === "string" ? value.bucket : undefined,
    region: typeof value.region === "string" ? value.region : undefined,
    endpoint: typeof value.endpoint === "string" ? value.endpoint : undefined,
    prefix: typeof value.prefix === "string" ? value.prefix : undefined,
    customDomain:
      typeof value.customDomain === "string" ? value.customDomain : undefined,
  };
}

function validateSource(
  value: unknown,
  issues: string[],
): ManifestSource | null {
  if (!isRecord(value)) {
    issues.push("source must be an object");
    return null;
  }

  if (value.provider === "unknown") {
    return UNKNOWN_SOURCE;
  }

  if (value.provider !== "s3") {
    issues.push("source.provider must be 's3' or 'unknown'");
    return null;
  }

  for (const field of [
    "bucket",
    "region",
    "endpoint",
    "prefix",
    "customDomain",
  ]) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && typeof fieldValue !== "string") {
      issues.push(`source.${field} must be a string when present`);
    }
  }

  return normalizeSource(value);
}

function normalizeIndexes(value: unknown): {
  cameras: CameraInfo[];
  lenses: LensInfo[];
} {
  if (!isRecord(value)) {
    return { cameras: [], lenses: [] };
  }

  return {
    cameras: Array.isArray(value.cameras)
      ? value.cameras.flatMap((camera) => {
          const normalized = normalizeCameraInfo(camera);
          return normalized ? [normalized] : [];
        })
      : [],
    lenses: Array.isArray(value.lenses)
      ? value.lenses.flatMap((lens) => {
          const normalized = normalizeLensInfo(lens);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeCameraInfo(value: unknown): CameraInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.make !== "string" ||
    typeof value.model !== "string" ||
    typeof value.displayName !== "string"
  ) {
    return null;
  }
  return {
    make: value.make,
    model: value.model,
    displayName: value.displayName,
  };
}

function normalizeLensInfo(value: unknown): LensInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.model !== "string" ||
    typeof value.displayName !== "string"
  ) {
    return null;
  }
  return {
    make: typeof value.make === "string" ? value.make : undefined,
    model: value.model,
    displayName: value.displayName,
  };
}

function validateIndexes(
  value: unknown,
  issues: string[],
): AfilmoryManifest["indexes"] | null {
  if (!isRecord(value)) {
    issues.push("indexes must be an object");
    return null;
  }

  if (!Array.isArray(value.cameras)) {
    issues.push("indexes.cameras must be an array");
  } else {
    for (const [index, camera] of value.cameras.entries()) {
      const path = `indexes.cameras[${index}]`;
      pushIssue(issues, isRecord(camera), `${path} must be an object`);
      if (!isRecord(camera)) continue;
      pushIssue(
        issues,
        typeof camera.make === "string",
        `${path}.make must be a string`,
      );
      pushIssue(
        issues,
        typeof camera.model === "string",
        `${path}.model must be a string`,
      );
      pushIssue(
        issues,
        typeof camera.displayName === "string",
        `${path}.displayName must be a string`,
      );
    }
  }

  if (!Array.isArray(value.lenses)) {
    issues.push("indexes.lenses must be an array");
  } else {
    for (const [index, lens] of value.lenses.entries()) {
      const path = `indexes.lenses[${index}]`;
      pushIssue(issues, isRecord(lens), `${path} must be an object`);
      if (!isRecord(lens)) continue;
      if (lens.make !== undefined) {
        pushIssue(
          issues,
          typeof lens.make === "string",
          `${path}.make must be a string`,
        );
      }
      pushIssue(
        issues,
        typeof lens.model === "string",
        `${path}.model must be a string`,
      );
      pushIssue(
        issues,
        typeof lens.displayName === "string",
        `${path}.displayName must be a string`,
      );
    }
  }

  return normalizeIndexes(value);
}

function validateLocation(
  value: unknown,
  issues: string[],
  path: string,
): void {
  if (value === null) return;
  pushIssue(issues, isRecord(value), `${path} must be null or an object`);
  if (!isRecord(value)) return;
  pushIssue(
    issues,
    isFiniteNumber(value.latitude),
    `${path}.latitude must be a number`,
  );
  pushIssue(
    issues,
    isFiniteNumber(value.longitude),
    `${path}.longitude must be a number`,
  );
}

function normalizeStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      record[key] = item;
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function normalizeAdminInfo(value: unknown): LocationAdminInfo | undefined {
  if (!isRecord(value)) return undefined;
  const admin: LocationAdminInfo = {
    country: typeof value.country === "string" ? value.country : undefined,
    countryCode:
      typeof value.countryCode === "string" ? value.countryCode : undefined,
    region: typeof value.region === "string" ? value.region : undefined,
    city: typeof value.city === "string" ? value.city : undefined,
    district: typeof value.district === "string" ? value.district : undefined,
  };
  return Object.values(admin).some(Boolean) ? admin : undefined;
}

function normalizeAdminInfoRecord(
  value: unknown,
): Record<string, LocationAdminInfo> | undefined {
  if (!isRecord(value)) return undefined;
  const record: Record<string, LocationAdminInfo> = {};
  for (const [key, item] of Object.entries(value)) {
    const admin = normalizeAdminInfo(item);
    if (admin) {
      record[key] = admin;
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function normalizeLocation(value: unknown): LocationInfo | null {
  if (!isRecord(value)) return null;
  const location: LocationInfo = {
    latitude: isFiniteNumber(value.latitude) ? value.latitude : 0,
    longitude: isFiniteNumber(value.longitude) ? value.longitude : 0,
  };

  const admin = normalizeAdminInfo(value.admin);
  if (admin) location.admin = admin;
  const adminI18n = normalizeAdminInfoRecord(value.adminI18n);
  if (adminI18n) location.adminI18n = adminI18n;
  const adminKey = normalizeAdminInfo(value.adminKey);
  if (adminKey) location.adminKey = adminKey;
  if (typeof value.country === "string") location.country = value.country;
  if (typeof value.city === "string") location.city = value.city;
  if (typeof value.locationName === "string") {
    location.locationName = value.locationName;
  }
  const locationNameI18n = normalizeStringRecord(value.locationNameI18n);
  if (locationNameI18n) location.locationNameI18n = locationNameI18n;

  return location;
}

function validateToneAnalysis(
  value: unknown,
  issues: string[],
  path: string,
): void {
  if (value === null) return;
  pushIssue(issues, isRecord(value), `${path} must be null or an object`);
  if (!isRecord(value)) return;
  pushIssue(
    issues,
    typeof value.toneType === "string" &&
      VALID_TONE_TYPES.has(value.toneType as ToneType),
    `${path}.toneType is invalid`,
  );
  for (const field of [
    "brightness",
    "contrast",
    "shadowRatio",
    "highlightRatio",
  ]) {
    pushIssue(
      issues,
      isFiniteNumber(value[field]),
      `${path}.${field} must be a number`,
    );
  }
}

function isToneType(value: unknown): value is ToneType {
  return typeof value === "string" && VALID_TONE_TYPES.has(value as ToneType);
}

function normalizeToneAnalysis(value: unknown): ToneAnalysis | null {
  if (!isRecord(value)) return null;
  return {
    toneType: isToneType(value.toneType) ? value.toneType : "normal",
    brightness: isFiniteNumber(value.brightness) ? value.brightness : 0,
    contrast: isFiniteNumber(value.contrast) ? value.contrast : 0,
    shadowRatio: isFiniteNumber(value.shadowRatio) ? value.shadowRatio : 0,
    highlightRatio: isFiniteNumber(value.highlightRatio)
      ? value.highlightRatio
      : 0,
  };
}

function validateVideo(value: unknown, issues: string[], path: string): void {
  if (value === undefined) return;
  pushIssue(issues, isRecord(value), `${path} must be an object`);
  if (!isRecord(value)) return;

  if (value.type === "live-photo") {
    pushIssue(
      issues,
      typeof value.videoUrl === "string",
      `${path}.videoUrl must be a string`,
    );
    pushIssue(
      issues,
      typeof value.s3Key === "string",
      `${path}.s3Key must be a string`,
    );
    return;
  }

  if (value.type === "motion-photo") {
    pushIssue(
      issues,
      isFiniteNumber(value.offset),
      `${path}.offset must be a number`,
    );
    if (value.size !== undefined) {
      pushIssue(
        issues,
        isFiniteNumber(value.size),
        `${path}.size must be a number`,
      );
    }
    if (value.presentationTimestamp !== undefined) {
      pushIssue(
        issues,
        isFiniteNumber(value.presentationTimestamp),
        `${path}.presentationTimestamp must be a number`,
      );
    }
    return;
  }

  issues.push(`${path}.type is invalid`);
}

function normalizeVideo(value: unknown): VideoSource | undefined {
  if (!isRecord(value)) return undefined;

  if (value.type === "live-photo") {
    if (typeof value.videoUrl !== "string" || typeof value.s3Key !== "string") {
      return undefined;
    }
    return {
      type: "live-photo",
      videoUrl: value.videoUrl,
      s3Key: value.s3Key,
    };
  }

  if (value.type === "motion-photo") {
    if (!isFiniteNumber(value.offset)) return undefined;
    return {
      type: "motion-photo",
      offset: value.offset,
      size: isFiniteNumber(value.size) ? value.size : undefined,
      presentationTimestamp: isFiniteNumber(value.presentationTimestamp)
        ? value.presentationTimestamp
        : undefined,
    };
  }

  return undefined;
}

function normalizeExif(value: unknown): PickedExif | null {
  if (value === null || !isRecord(value)) return null;
  const exif: PickedExif = {};
  Object.assign(exif, value);
  return exif;
}

function validatePhoto(
  value: unknown,
  index: number,
): { item: PhotoManifestItem | null; issues: string[] } {
  // 每张照片用独立的 issues 数组，避免一张坏照片污染整个 manifest 的校验结果。
  // 严格模式由调用方把这些 issues 汇入共享数组；宽松模式据此只丢弃出错的照片。
  const issues: string[] = [];
  const path = `photos[${index}]`;
  pushIssue(issues, isRecord(value), `${path} must be an object`);
  if (!isRecord(value)) return { item: null, issues };

  for (const field of [
    "id",
    "originalUrl",
    "thumbnailUrl",
    "s3Key",
    "lastModified",
    "title",
    "dateTaken",
    "description",
  ]) {
    pushIssue(
      issues,
      typeof value[field] === "string",
      `${path}.${field} must be a string`,
    );
  }

  for (const field of ["width", "height", "aspectRatio", "size"]) {
    pushIssue(
      issues,
      isFiniteNumber(value[field]),
      `${path}.${field} must be a number`,
    );
  }

  pushIssue(
    issues,
    isStringArray(value.tags),
    `${path}.tags must be a string array`,
  );
  pushIssue(
    issues,
    value.thumbHash === null || typeof value.thumbHash === "string",
    `${path}.thumbHash must be null or a string`,
  );
  pushIssue(
    issues,
    value.exif === null || isRecord(value.exif),
    `${path}.exif must be null or an object`,
  );
  validateToneAnalysis(value.toneAnalysis, issues, `${path}.toneAnalysis`);
  validateLocation(value.location, issues, `${path}.location`);
  validateVideo(value.video, issues, `${path}.video`);

  if (value.isHDR !== undefined) {
    pushIssue(
      issues,
      typeof value.isHDR === "boolean",
      `${path}.isHDR must be a boolean`,
    );
  }

  const item: PhotoManifestItem = {
    id: typeof value.id === "string" ? value.id : "",
    originalUrl: typeof value.originalUrl === "string" ? value.originalUrl : "",
    thumbnailUrl:
      typeof value.thumbnailUrl === "string" ? value.thumbnailUrl : "",
    thumbHash:
      typeof value.thumbHash === "string" || value.thumbHash === null
        ? value.thumbHash
        : null,
    width: isFiniteNumber(value.width) ? value.width : 0,
    height: isFiniteNumber(value.height) ? value.height : 0,
    aspectRatio: isFiniteNumber(value.aspectRatio) ? value.aspectRatio : 1,
    s3Key: typeof value.s3Key === "string" ? value.s3Key : "",
    lastModified:
      typeof value.lastModified === "string" ? value.lastModified : "",
    size: isFiniteNumber(value.size) ? value.size : 0,
    etag: typeof value.etag === "string" ? value.etag : undefined,
    exif: normalizeExif(value.exif),
    toneAnalysis: normalizeToneAnalysis(value.toneAnalysis),
    location: normalizeLocation(value.location),
    title: typeof value.title === "string" ? value.title : "",
    dateTaken: typeof value.dateTaken === "string" ? value.dateTaken : "",
    tags: isStringArray(value.tags) ? value.tags : [],
    description: typeof value.description === "string" ? value.description : "",
  };

  if (typeof value.isHDR === "boolean") {
    item.isHDR = value.isHDR;
  }
  const video = normalizeVideo(value.video);
  if (video) {
    item.video = video;
  }

  return { item, issues };
}

export function createManifest({
  generatedAt = new Date().toISOString(),
  indexes = { cameras: [], lenses: [] },
  photos = [],
  source = UNKNOWN_SOURCE,
}: {
  generatedAt?: string;
  indexes?: {
    cameras?: CameraInfo[];
    lenses?: LensInfo[];
  };
  photos?: PhotoManifestItem[];
  source?: ManifestSource;
} = {}): AfilmoryManifest {
  return {
    schema: AFILMORY_MANIFEST_SCHEMA,
    version: CURRENT_MANIFEST_VERSION,
    generatedAt,
    source,
    photos,
    indexes: {
      cameras: indexes.cameras ?? [],
      lenses: indexes.lenses ?? [],
    },
  };
}

export function createEmptyManifest(): AfilmoryManifest {
  return createManifest();
}

export function isAfilmoryManifest(input: unknown): input is AfilmoryManifest {
  return validateManifest(input).success;
}

export function validateManifest(input: unknown): ManifestValidationResult {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return {
      success: false,
      issues: ["manifest must be an object"],
    };
  }

  pushIssue(
    issues,
    input.schema === AFILMORY_MANIFEST_SCHEMA,
    `schema must be '${AFILMORY_MANIFEST_SCHEMA}'`,
  );
  pushIssue(
    issues,
    input.version === CURRENT_MANIFEST_VERSION,
    `version must be ${CURRENT_MANIFEST_VERSION}`,
  );
  pushIssue(
    issues,
    typeof input.generatedAt === "string",
    "generatedAt must be a string",
  );

  const source = validateSource(input.source, issues);
  const indexes = validateIndexes(input.indexes, issues);

  const photos: PhotoManifestItem[] = [];
  if (!Array.isArray(input.photos)) {
    issues.push("photos must be an array");
  } else {
    for (const [index, photo] of input.photos.entries()) {
      const { item, issues: photoIssues } = validatePhoto(photo, index);
      issues.push(...photoIssues);
      if (item) {
        photos.push(item);
      }
    }
  }

  if (issues.length > 0 || !source || !indexes) {
    return {
      success: false,
      issues,
    };
  }

  return {
    success: true,
    manifest: createManifest({
      generatedAt: input.generatedAt as string,
      source,
      photos,
      indexes,
    }),
  };
}

export function assertManifest(input: unknown): AfilmoryManifest {
  const result = validateManifest(input);
  if (!result.success) {
    throw new ManifestValidationError(result.issues);
  }
  return result.manifest;
}

export function parseManifest(input?: unknown): AfilmoryManifest {
  const result = validateManifest(input);
  return result.success ? result.manifest : createEmptyManifest();
}

export interface SkippedPhoto {
  index: number;
  issues: string[];
}

export interface LenientManifestParseResult {
  manifest: AfilmoryManifest;
  skipped: SkippedPhoto[];
}

/**
 * 宽松解析：顶层结构（schema/version/generatedAt/source/indexes/photos 数组）仍严格——
 * 任一项无效都抛 {@link ManifestValidationError}，由调用方决定如何降级（运行时显示诊断页，
 * 构建期丢弃缓存做全量重建）。照片层面逐张校验，任一张不合法只跳过它并记入 `skipped`，
 * 保留其余照片，绝不让一张坏照片清空整个图库或砖掉后续构建。
 *
 * 严格完整性仍由 {@link assertManifest} 提供，用于"刚生成的 manifest"等构建闸门。
 */
export function parseManifestLenient(
  input: unknown,
): LenientManifestParseResult {
  if (!isRecord(input)) {
    throw new ManifestValidationError(["manifest must be an object"]);
  }

  const envelopeIssues: string[] = [];
  pushIssue(
    envelopeIssues,
    input.schema === AFILMORY_MANIFEST_SCHEMA,
    `schema must be '${AFILMORY_MANIFEST_SCHEMA}'`,
  );
  pushIssue(
    envelopeIssues,
    input.version === CURRENT_MANIFEST_VERSION,
    `version must be ${CURRENT_MANIFEST_VERSION}`,
  );
  const generatedAt =
    typeof input.generatedAt === "string" ? input.generatedAt : null;
  pushIssue(
    envelopeIssues,
    generatedAt !== null,
    "generatedAt must be a string",
  );
  const source = validateSource(input.source, envelopeIssues);
  const indexes = validateIndexes(input.indexes, envelopeIssues);
  const photosAreArray = Array.isArray(input.photos);
  pushIssue(envelopeIssues, photosAreArray, "photos must be an array");

  if (
    envelopeIssues.length > 0 ||
    !source ||
    !indexes ||
    generatedAt === null ||
    !photosAreArray
  ) {
    throw new ManifestValidationError(envelopeIssues);
  }

  const photos: PhotoManifestItem[] = [];
  const skipped: SkippedPhoto[] = [];
  for (const [index, photo] of (input.photos as unknown[]).entries()) {
    const { item, issues } = validatePhoto(photo, index);
    if (item && issues.length === 0) {
      photos.push(item);
    } else {
      skipped.push({ index, issues });
    }
  }

  return {
    manifest: createManifest({ generatedAt, source, photos, indexes }),
    skipped,
  };
}
