import type { GeocodingProviderName } from "../photo/geocoding.js";

export const DEFAULT_CACHE_PRECISION = 4;
export const DEFAULT_GEOCODING_LOCALES = ["en", "zh-CN"] as const;
export const CANONICAL_GEOCODING_LOCALE = "en";

export interface GeocodingPluginOptions {
  enable?: boolean;
  provider?: GeocodingProviderName;
  mapboxToken?: string;
  nominatimBaseUrl?: string;
  nominatimUserAgent?: string;
  cachePath?: string;
  cachePrecision?: number;
  /**
   * Preferred languages for geocoding results (BCP47). Accepts comma-separated string or array.
   */
  language?: string | string[];
  /**
   * Locales to precompute for runtime localized geographic names.
   */
  locales?: string | string[];
}

export type GeocodingPluginOptionsResolved = Required<
  Pick<GeocodingPluginOptions, "enable" | "provider">
> &
  Pick<
    GeocodingPluginOptions,
    | "mapboxToken"
    | "nominatimBaseUrl"
    | "nominatimUserAgent"
    | "cachePath"
    | "cachePrecision"
  > & {
    locales: string[];
  };

export interface ResolvedGeocodingSettings {
  provider: GeocodingProviderName;
  mapboxToken?: string;
  nominatimBaseUrl?: string;
  nominatimUserAgent?: string;
  cachePath?: string;
  cachePrecision: number;
  locales: string[];
}

function normalizeCachePrecision(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_CACHE_PRECISION;
  }

  const rounded = Math.round(value);
  return Math.max(0, Math.min(10, rounded));
}

function parseLocaleList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function normalizeGeocodingLocales(
  locales?: string | string[],
  legacyLanguage?: string | string[],
): string[] {
  const requested =
    parseLocaleList(locales).length > 0
      ? parseLocaleList(locales)
      : parseLocaleList(legacyLanguage).length > 0
        ? parseLocaleList(legacyLanguage)
        : [...DEFAULT_GEOCODING_LOCALES];

  const deduped = Array.from(new Set(requested));
  return [
    CANONICAL_GEOCODING_LOCALE,
    ...deduped.filter((locale) => locale !== CANONICAL_GEOCODING_LOCALE),
  ];
}

export function resolveGeocodingOptions(
  options: GeocodingPluginOptions,
): GeocodingPluginOptionsResolved {
  return {
    enable: options.enable ?? false,
    provider: options.provider ?? "nominatim",
    mapboxToken: options.mapboxToken,
    nominatimBaseUrl: options.nominatimBaseUrl,
    nominatimUserAgent: options.nominatimUserAgent,
    cachePath: options.cachePath,
    cachePrecision: normalizeCachePrecision(
      options.cachePrecision ?? DEFAULT_CACHE_PRECISION,
    ),
    locales: normalizeGeocodingLocales(options.locales, options.language),
  };
}

export function createResolvedGeocodingSettings(
  options: GeocodingPluginOptionsResolved,
): ResolvedGeocodingSettings {
  return {
    provider: options.provider,
    mapboxToken: options.mapboxToken,
    nominatimBaseUrl: options.nominatimBaseUrl,
    nominatimUserAgent: options.nominatimUserAgent,
    cachePath: options.cachePath,
    cachePrecision: options.cachePrecision ?? DEFAULT_CACHE_PRECISION,
    locales: options.locales,
  };
}
