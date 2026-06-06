import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  ManifestSource,
  PhotoManifestItem,
  ToneType,
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
      ? (value.cameras as CameraInfo[])
      : [],
    lenses: Array.isArray(value.lenses) ? (value.lenses as LensInfo[]) : [],
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

function validatePhoto(
  value: unknown,
  issues: string[],
  index: number,
): PhotoManifestItem | null {
  const path = `photos[${index}]`;
  pushIssue(issues, isRecord(value), `${path} must be an object`);
  if (!isRecord(value)) return null;

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

  return value as unknown as PhotoManifestItem;
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
      const validatedPhoto = validatePhoto(photo, issues, index);
      if (validatedPhoto) {
        photos.push(validatedPhoto);
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
