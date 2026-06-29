import fs from "node:fs/promises";
import path from "node:path";

import { normalizeLocationInfoAdminAliases } from "@afilmory/schema";

import type { LocationAdminInfo, LocationInfo } from "../types/photo.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import type { ResolvedGeocodingSettings } from "./geocoding-options.js";
import { CANONICAL_GEOCODING_LOCALE } from "./geocoding-options.js";

export interface GeocodingCacheLogger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

export type PersistentCacheEntry = {
  locales: Record<string, LocationInfo | null>;
  updatedAt?: string;
};

type PersistentCacheFileV1 = {
  version?: 1;
  updatedAt?: string;
  entries: Record<string, LocationInfo | null>;
};

type PersistentCacheFileV2 = {
  version: 2;
  updatedAt: string;
  entries: Record<string, PersistentCacheEntry>;
};

export interface GeocodingCacheState {
  cache: Map<string, PersistentCacheEntry>;
  loadedCachePath: string | null;
  cacheDirty: boolean;
}

export function createGeocodingCacheState(): GeocodingCacheState {
  return {
    cache: new Map(),
    loadedCachePath: null,
    cacheDirty: false,
  };
}

export function buildCacheKey(
  latitude: number,
  longitude: number,
  settings: ResolvedGeocodingSettings,
): string {
  return [
    settings.provider,
    settings.nominatimBaseUrl ?? "",
    settings.cachePrecision.toString(),
    latitude.toFixed(settings.cachePrecision),
    longitude.toFixed(settings.cachePrecision),
  ].join("|");
}

export function normalizeCachePath(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? path.resolve(trimmed) : null;
}

export async function ensurePersistentCacheLoaded(
  state: GeocodingCacheState,
  cachePath: string | null,
  logger: GeocodingCacheLogger,
): Promise<void> {
  if (!cachePath || state.loadedCachePath === cachePath) return;

  state.cache.clear();
  state.loadedCachePath = cachePath;
  state.cacheDirty = false;

  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<
      PersistentCacheFileV1 | PersistentCacheFileV2
    >;
    const entries =
      parsed && typeof parsed === "object" && parsed.entries
        ? parsed.entries
        : {};

    if (parsed.version === 2) {
      for (const [key, value] of Object.entries(
        entries as PersistentCacheFileV2["entries"],
      )) {
        if (!value || typeof value !== "object" || !value.locales) continue;
        const locales: Record<string, LocationInfo | null> = {};
        for (const [locale, location] of Object.entries(value.locales)) {
          locales[locale] =
            location === null
              ? null
              : normalizeLocationInfoAdminAliases(location, locale);
        }
        state.cache.set(key, {
          locales,
          updatedAt: value.updatedAt,
        });
      }
    } else {
      for (const [key, value] of Object.entries(
        entries as PersistentCacheFileV1["entries"],
      )) {
        const migrated = migrateV1CacheEntry(key, value);
        if (migrated) {
          const existing = state.cache.get(migrated.key);
          state.cache.set(migrated.key, {
            locales: {
              ...existing?.locales,
              [migrated.locale]:
                migrated.location === null
                  ? null
                  : normalizeLocationInfoAdminAliases(
                      migrated.location,
                      migrated.locale,
                    ),
            },
            updatedAt: existing?.updatedAt,
          });
          state.cacheDirty = true;
        }
      }
    }

    logger.info(`📍 已载入地理编码缓存：${state.cache.size} 条`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    logger.warn("读取地理编码缓存失败，将继续使用空缓存", error);
  }
}

export function migrateV1CacheEntry(
  key: string,
  value: LocationInfo | null,
): { key: string; locale: string; location: LocationInfo | null } | null {
  const [provider, baseUrl = "", locale, latitude, longitude] = key.split("|");
  if (!provider || !locale || !latitude || !longitude) return null;
  const precision = Math.max(
    latitude.split(".")[1]?.length ?? 0,
    longitude.split(".")[1]?.length ?? 0,
  );
  return {
    key: [provider, baseUrl, precision.toString(), latitude, longitude].join(
      "|",
    ),
    locale,
    location: value,
  };
}

export async function savePersistentCacheIfNeeded(
  state: GeocodingCacheState,
  cachePath: string | null,
  logger: GeocodingCacheLogger,
): Promise<void> {
  if (!cachePath || !state.cacheDirty) return;

  const entries: Record<string, PersistentCacheEntry> = {};
  for (const [key, value] of state.cache.entries()) {
    entries[key] = value;
  }

  await writeFileAtomic(
    cachePath,
    JSON.stringify(
      {
        version: 2,
        updatedAt: new Date().toISOString(),
        entries,
      } satisfies PersistentCacheFileV2,
      null,
      2,
    ),
  );
  state.cacheDirty = false;
  logger.info(`📍 已保存地理编码缓存：${Object.keys(entries).length} 条`);
}

export function hasRequiredLocalizedLocation(
  location: LocationInfo | null | undefined,
  locales: string[],
): boolean {
  if (!location?.adminI18n || !location.adminKey) return false;
  return locales.every((locale) => locale in (location.adminI18n ?? {}));
}

function cleanLocationValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replaceAll(/\s+/g, " ");
  return trimmed || undefined;
}

function createAdminKey(
  location: LocationInfo | null,
): LocationAdminInfo | undefined {
  const admin = location?.admin;
  if (!admin) return undefined;

  const key: LocationAdminInfo = {
    country: cleanLocationValue(admin.country),
    countryCode: cleanLocationValue(admin.countryCode),
    region: cleanLocationValue(admin.region),
    city: cleanLocationValue(admin.city),
    district: cleanLocationValue(admin.district),
  };

  return Object.values(key).some(Boolean) ? key : undefined;
}

function createSeedLocation(
  latitude: number,
  longitude: number,
  admin: LocationAdminInfo,
  locationName?: string,
): LocationInfo {
  return {
    latitude,
    longitude,
    admin,
    country: admin.country,
    city: admin.city ?? admin.district ?? admin.region,
    locationName,
  };
}

export function seedCacheEntryFromExistingLocation(
  entry: PersistentCacheEntry,
  location: LocationInfo | null | undefined,
  latitude: number,
  longitude: number,
): boolean {
  if (!location) return false;

  const adminsByLocale: Record<string, LocationAdminInfo> = {
    ...location.adminI18n,
  };

  if (!adminsByLocale[CANONICAL_GEOCODING_LOCALE] && location.adminKey) {
    adminsByLocale[CANONICAL_GEOCODING_LOCALE] = location.adminKey;
  }

  let changed = false;
  for (const [locale, admin] of Object.entries(adminsByLocale)) {
    if (locale in entry.locales) continue;
    if (!Object.values(admin).some(Boolean)) continue;

    entry.locales[locale] = normalizeLocationInfoAdminAliases(
      createSeedLocation(
        latitude,
        longitude,
        admin,
        location.locationNameI18n?.[locale],
      ),
      locale,
    );
    changed = true;
  }

  return changed;
}

export function composeLocalizedLocation(
  latitude: number,
  longitude: number,
  entry: PersistentCacheEntry,
): LocationInfo | null {
  const localizedLocations = Object.entries(entry.locales).filter(
    (item): item is [string, LocationInfo] => item[1] !== null,
  );
  const canonical =
    entry.locales[CANONICAL_GEOCODING_LOCALE] ??
    localizedLocations[0]?.[1] ??
    null;
  if (!canonical) return null;

  const adminI18n: Record<string, LocationAdminInfo> = {};
  const locationNameI18n: Record<string, string> = {};
  for (const [locale, location] of localizedLocations) {
    if (location.admin) {
      adminI18n[locale] = location.admin;
    }
    if (location.locationName) {
      locationNameI18n[locale] = location.locationName;
    }
  }

  const adminKey = createAdminKey(
    entry.locales[CANONICAL_GEOCODING_LOCALE] ?? canonical,
  );

  return {
    latitude,
    longitude,
    admin: canonical.admin,
    adminI18n,
    adminKey,
    country: canonical.country,
    city: canonical.city,
    locationName: canonical.locationName,
    ...(Object.keys(locationNameI18n).length > 0 ? { locationNameI18n } : {}),
  };
}
