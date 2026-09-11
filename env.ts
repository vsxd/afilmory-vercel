import "dotenv-expand/config";

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const RESERVED_PUBLIC_PATH_SEGMENTS = new Set([
  "assets",
  "photos",
  "thumbnails",
  "vendor",
]);

const normalizeLocalPhotosBaseUrl = (value: string): string =>
  value.replace(/\/+$/, "");

const isPortablePublicPath = (value: string): boolean => {
  if (!value.startsWith("/") || value === "/" || value.startsWith("//")) {
    return false;
  }

  const segments = value.slice(1).split("/");
  return segments.every(
    (segment) =>
      /^[\w.~-]+$/.test(segment) &&
      segment !== "." &&
      segment !== ".." &&
      !segment.endsWith(".") &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
  );
};

const safePublicUrl = z
  .string()
  .trim()
  .pipe(z.url())
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.href.includes("?") &&
      !url.href.includes("#")
    );
  }, "must be an http(s) URL without credentials, query parameters, or a fragment");

export const env = createEnv({
  server: {
    // Photo source. S3 remains the deployment default; local is a first-class
    // zero-credential mode for self-contained/static builds.
    PHOTO_STORAGE_PROVIDER: z.enum(["s3", "local"]).default("s3"),
    LOCAL_PHOTOS_PATH: z.string().trim().min(1).default("photos"),
    LOCAL_PHOTOS_BASE_URL: z
      .string()
      .trim()
      .transform(normalizeLocalPhotosBaseUrl)
      .refine(isPortablePublicPath, {
        message:
          "LOCAL_PHOTOS_BASE_URL must be a root-relative path made of portable ASCII path segments",
      })
      .refine(
        (value) => {
          const namespace = value.slice(1).split("/", 1)[0]?.toLowerCase();
          return !namespace || !RESERVED_PUBLIC_PATH_SEGMENTS.has(namespace);
        },
        {
          message:
            "LOCAL_PHOTOS_BASE_URL conflicts with a reserved application path",
        },
      )
      .default("/originals"),

    // S3 storage config (required when PHOTO_STORAGE_PROVIDER=s3)
    S3_REGION: z.string().default("us-east-1"),
    // May be empty when building the frontend; the builder validates strictly at runtime
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_ENDPOINT: safePublicUrl.default("https://s3.us-east-1.amazonaws.com"),
    S3_BUCKET_NAME: z.string().default(""),
    S3_PREFIX: z.string().default(""),
    S3_CUSTOM_DOMAIN: z.union([z.literal(""), safePublicUrl]).default(""),
    S3_EXCLUDE_REGEX: z.string().optional(),

    // Remote repository cache config (optional)
    REPO_URL: z.string().optional(),
    REPO_TOKEN: z.string().optional(),
    BUILDER_REPO_URL: z.string().optional(),
    GIT_TOKEN: z.string().optional(),

    // Basic site config (optional; falls back to the defaults in site.config.ts when unset)
    SITE_NAME: z.string().optional(),
    SITE_TITLE: z.string().optional(),
    SITE_DESCRIPTION: z.string().optional(),
    SITE_URL: z.preprocess(
      (value) =>
        typeof value === "string" && !value.trim() ? undefined : value,
      safePublicUrl.optional(),
    ),
    SITE_ACCENT_COLOR: z
      .string()
      .regex(/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)
      .optional(),
    SITE_LANGUAGE: z
      .enum(["en", "ja", "ko", "zh-CN", "zh-HK", "zh-TW"])
      .optional(),

    // Author info (optional)
    AUTHOR_NAME: z.string().optional(),
    AUTHOR_URL: z.url().optional(),
    AUTHOR_AVATAR: z.url().optional(),

    // Social media (optional)
    SOCIAL_GITHUB: z.string().optional(),
    SOCIAL_TWITTER: z.string().optional(),
    SOCIAL_RSS: z.enum(["true", "false"]).optional(), // 'true' or 'false'

    // Feed config (optional)
    FEED_FOLO_FEED_ID: z.string().optional(),
    FEED_FOLO_USER_ID: z.string().optional(),

    // Map config (optional)
    MAP_STYLE: z.string().optional(), // 'builtin' or custom
    MAP_PROJECTION: z.enum(["globe", "mercator"]).optional(),

    // Vercel sets these automatically. Only use its stable production hostname
    // for site metadata; a preview deployment URL is never a canonical URL.
    VERCEL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),

    // Build-time reverse geocoding (optional)
    // The boolean switch is enum-constrained so a typo fails immediately at build
    // time instead of being silently treated as true by `!== "false"`.
    PHOTO_LOCATION_MODE: z.enum(["strip", "coarse", "exact"]).default("coarse"),
    GEOCODING_ENABLED: z.enum(["true", "false"]).default("false"),
    GEOCODING_PROVIDER: z.enum(["nominatim", "mapbox", "auto"]).optional(),
    GEOCODING_LOCALES: z.string().optional(),
    GEOCODING_LANGUAGE: z.string().optional(),
    GEOCODING_USER_AGENT: z.string().optional(),
    GEOCODING_CACHE_PATH: z.string().optional(),
    GEOCODING_CACHE_PRECISION: z.coerce.number().optional(),
    GEOCODING_NOMINATIM_BASE_URL: z.url().optional(),
    MAPBOX_TOKEN: z.string().optional(),

    // Builder performance config (optional)
    BUILDER_USE_CLUSTER_MODE: z.enum(["true", "false"]).optional(),
    BUILDER_WORKER_COUNT: z.coerce.number().int().positive().optional(),
  },
  runtimeEnv: process.env,
  isServer: typeof window === "undefined",
});
