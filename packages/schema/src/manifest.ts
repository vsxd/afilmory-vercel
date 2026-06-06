import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  ManifestSource,
  PhotoManifestItem,
} from "./types.ts";
import {
  AFILMORY_MANIFEST_SCHEMA,
  CURRENT_MANIFEST_VERSION,
} from "./version.ts";

const UNKNOWN_SOURCE: ManifestSource = { provider: "unknown" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  return (
    isRecord(input) &&
    input.schema === AFILMORY_MANIFEST_SCHEMA &&
    input.version === CURRENT_MANIFEST_VERSION &&
    typeof input.generatedAt === "string" &&
    Array.isArray(input.photos) &&
    isRecord(input.indexes)
  );
}

export function parseManifest(input?: unknown): AfilmoryManifest {
  if (!isAfilmoryManifest(input)) {
    return createEmptyManifest();
  }

  return createManifest({
    generatedAt: input.generatedAt,
    source: normalizeSource(input.source),
    photos: input.photos as PhotoManifestItem[],
    indexes: normalizeIndexes(input.indexes),
  });
}
