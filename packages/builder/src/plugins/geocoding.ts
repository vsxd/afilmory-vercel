import fs from "node:fs/promises";
import path from "node:path";

import { normalizeLocationInfoAdminAliases } from "@afilmory/schema";

import type { EmitPluginEventFn } from "../core/contracts/execution-context.js";
import type { BuilderServices } from "../core/contracts/services.js";
import type { Logger } from "../logger/index.js";
import {
  createStorageKeyNormalizer,
  getPhotoExecutionContext,
  runWithPhotoExecutionContext,
} from "../photo/execution-context.js";
import type { GeocodingProvider } from "../photo/geocoding.js";
import {
  createGeocodingProvider,
  extractLocationFromGPS,
  parseGPSCoordinates,
} from "../photo/geocoding.js";
import { createPhotoProcessingLoggers } from "../photo/logger-adapter.js";
import type {
  LocationAdminInfo,
  LocationInfo,
  PhotoManifestItem,
  PickedExif,
} from "../types/photo.js";
import type { BuilderPlugin } from "./types.js";

const PLUGIN_NAME = "afilmory:geocoding";
const RUN_STATE_KEY = "geocodingState";
const DEFAULT_CACHE_PRECISION = 4;
const DEFAULT_GEOCODING_LOCALES = ["en", "zh-CN"] as const;
const CANONICAL_GEOCODING_LOCALE = "en";

interface GeocodingPluginOptions {
  enable?: boolean;
  provider?: "mapbox" | "nominatim" | "auto";
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
type GeocodingPluginOptionsResolved = Required<
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

interface ResolvedGeocodingSettings {
  provider: "mapbox" | "nominatim" | "auto";
  mapboxToken?: string;
  nominatimBaseUrl?: string;
  nominatimUserAgent?: string;
  cachePath?: string;
  cachePrecision: number;
  locales: string[];
}

interface GeocodingState {
  providers: Map<string, GeocodingProvider>;
  cache: Map<string, PersistentCacheEntry>;
  loadedCachePath: string | null;
  cacheDirty: boolean;
}

interface LocationResolutionResult {
  attempted: boolean;
  updated: boolean;
}

type LocationLogger = Logger["main"];

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

function resolveSettings(
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

function getOrCreateState(runShared: Map<string, unknown>): GeocodingState {
  const existing = runShared.get(RUN_STATE_KEY) as GeocodingState | undefined;
  if (existing) {
    return existing;
  }

  const next: GeocodingState = {
    providers: new Map(),
    cache: new Map(),
    loadedCachePath: null,
    cacheDirty: false,
  };
  runShared.set(RUN_STATE_KEY, next);
  return next;
}

function buildProviderKey(
  settings: ResolvedGeocodingSettings,
  locale: string,
): string {
  return `${settings.provider}:${settings.mapboxToken ?? ""}:${settings.nominatimBaseUrl ?? ""}:${settings.nominatimUserAgent ?? ""}:${locale}`;
}

function ensureProvider(
  state: GeocodingState,
  settings: ResolvedGeocodingSettings,
  locale: string,
  logger: LocationLogger,
): GeocodingProvider | null {
  const providerKey = buildProviderKey(settings, locale);
  const existing = state.providers.get(providerKey);
  if (existing) {
    return existing;
  }

  const provider = createGeocodingProvider(
    settings.provider,
    settings.mapboxToken,
    settings.nominatimBaseUrl,
    locale,
    settings.nominatimUserAgent,
  );

  if (!provider) {
    logger.warn("无法创建地理编码提供者，请检查 geocoding 配置和 Token");
    return null;
  }

  state.providers.set(providerKey, provider);
  return provider;
}

async function ensurePhotoContext<T>(
  services: BuilderServices,
  emitPluginEvent: EmitPluginEventFn,
  logger: Logger,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    getPhotoExecutionContext();
    return await fn();
  } catch {
    const storageConfig = services.storage.getConfig();
    const storageManager = services.storage.getManager();
    const normalizeStorageKey = createStorageKeyNormalizer(storageConfig);
    const loggers = createPhotoProcessingLoggers(0, logger);

    return await runWithPhotoExecutionContext(
      {
        services,
        emitPluginEvent,
        storageManager,
        storageConfig,
        normalizeStorageKey,
        loggers,
      },
      fn,
    );
  }
}

function buildCacheKey(
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

function normalizeCachePath(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? path.resolve(trimmed) : null;
}

async function ensurePersistentCacheLoaded(
  state: GeocodingState,
  cachePath: string | null,
  logger: LocationLogger,
) {
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

async function savePersistentCacheIfNeeded(
  state: GeocodingState,
  cachePath: string | null,
  logger: LocationLogger,
) {
  if (!cachePath || !state.cacheDirty) return;

  const entries: Record<string, PersistentCacheEntry> = {};
  for (const [key, value] of state.cache.entries()) {
    entries[key] = value;
  }

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
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

function hasRequiredLocalizedLocation(
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

async function resolveLocationForItem(
  item: PhotoManifestItem,
  exif: PickedExif | null | undefined,
  state: GeocodingState,
  settings: ResolvedGeocodingSettings,
  shouldOverwriteExisting: boolean,
  logger: LocationLogger,
): Promise<LocationResolutionResult> {
  const cachePath = normalizeCachePath(settings.cachePath);
  await ensurePersistentCacheLoaded(state, cachePath, logger);
  const wasComplete = hasRequiredLocalizedLocation(
    item.location,
    settings.locales,
  );

  if (wasComplete && !shouldOverwriteExisting) {
    return { attempted: false, updated: false };
  }

  if (!exif) {
    if (shouldOverwriteExisting) {
      item.location = null;
    }
    return { attempted: false, updated: false };
  }

  const { latitude, longitude } = parseGPSCoordinates(exif);
  if (latitude === undefined || longitude === undefined) {
    if (shouldOverwriteExisting) {
      item.location = null;
    }
    return { attempted: false, updated: false };
  }

  const cacheKey = buildCacheKey(latitude, longitude, settings);
  const cacheEntry = state.cache.get(cacheKey) ?? { locales: {} };
  const seededFromExisting = seedCacheEntryFromExistingLocation(
    cacheEntry,
    item.location,
    latitude,
    longitude,
  );
  if (seededFromExisting) {
    cacheEntry.updatedAt ??= new Date().toISOString();
    state.cacheDirty = true;
  }

  let attempted = false;
  for (const locale of settings.locales) {
    if (locale in cacheEntry.locales) {
      continue;
    }

    const provider = ensureProvider(state, settings, locale, logger);
    if (!provider) {
      continue;
    }

    attempted = true;
    const location = await extractLocationFromGPS(
      latitude,
      longitude,
      provider,
    );
    cacheEntry.locales[locale] = location
      ? normalizeLocationInfoAdminAliases(location, locale)
      : null;
    cacheEntry.updatedAt = new Date().toISOString();
    state.cacheDirty = true;
  }

  state.cache.set(cacheKey, cacheEntry);
  const localizedLocation = composeLocalizedLocation(
    latitude,
    longitude,
    cacheEntry,
  );

  if (localizedLocation) {
    item.location = localizedLocation;
    return {
      attempted: attempted || !wasComplete,
      updated: true,
    };
  }

  if (shouldOverwriteExisting) {
    item.location = null;
  }

  return {
    attempted,
    updated: false,
  };
}

export default function geocodingPlugin(
  options: GeocodingPluginOptions = {},
): BuilderPlugin {
  const normalizedOptions = resolveSettings(options);
  let settings: ResolvedGeocodingSettings | null = null;

  return {
    name: PLUGIN_NAME,
    hooks: {
      onInit: () => {
        settings = {
          provider: normalizedOptions.provider,
          mapboxToken: normalizedOptions.mapboxToken,
          nominatimBaseUrl: normalizedOptions.nominatimBaseUrl,
          nominatimUserAgent: normalizedOptions.nominatimUserAgent,
          cachePath: normalizedOptions.cachePath,
          cachePrecision:
            normalizedOptions.cachePrecision ?? DEFAULT_CACHE_PRECISION,
          locales: normalizedOptions.locales,
        };
      },
      afterPhotoProcess: async ({
        services,
        emitPluginEvent,
        payload,
        runShared,
        logger,
      }) => {
        if (!settings) return;

        const { item } = payload.result;
        if (!item) return;

        const shouldOverwriteExisting =
          payload.options.isForceMode || payload.options.isForceManifest;

        if (!normalizedOptions.enable) return;

        const currentSettings = settings;

        await ensurePhotoContext(
          services,
          emitPluginEvent,
          logger,
          async () => {
            const state = getOrCreateState(runShared);
            const locationLogger = logger.main.withTag("LOCATION");
            const exif =
              item.exif ?? payload.context.existingItem?.exif ?? null;
            await resolveLocationForItem(
              item,
              exif,
              state,
              currentSettings,
              shouldOverwriteExisting,
              locationLogger,
            );
          },
        );
      },
      afterProcessTasks: async ({
        services,
        emitPluginEvent,
        payload,
        runShared,
        logger,
      }) => {
        if (!settings || !normalizedOptions.enable) {
          return;
        }

        const currentSettings = settings;
        const state = getOrCreateState(runShared);
        const locationLogger = logger.main.withTag("LOCATION");

        const storageConfig = services.storage.getConfig();
        const storageManager = services.storage.getManager();
        const normalizeStorageKey = createStorageKeyNormalizer(storageConfig);
        const loggers = createPhotoProcessingLoggers(0, logger);

        await runWithPhotoExecutionContext(
          {
            services,
            emitPluginEvent,
            storageManager,
            storageConfig,
            normalizeStorageKey,
            loggers,
          },
          async () => {
            let attempted = 0;
            let updated = 0;
            const shouldOverwriteExisting =
              payload.options.isForceMode || payload.options.isForceManifest;

            for (const item of payload.manifest) {
              if (!item) continue;
              if (
                hasRequiredLocalizedLocation(
                  item.location,
                  currentSettings.locales,
                ) &&
                !shouldOverwriteExisting
              ) {
                continue;
              }

              const { attempted: didAttempt, updated: didUpdate } =
                await resolveLocationForItem(
                  item,
                  item.exif,
                  state,
                  currentSettings,
                  shouldOverwriteExisting,
                  locationLogger,
                );

              if (didAttempt) {
                attempted++;
                if (didUpdate) {
                  updated++;
                }
              }
            }

            if (attempted > 0) {
              locationLogger.info(
                `📍 为 ${attempted} 张缺失位置信息的照片尝试补全，成功 ${updated} 张`,
              );
            }

            await savePersistentCacheIfNeeded(
              state,
              normalizeCachePath(currentSettings.cachePath),
              locationLogger,
            );
          },
        );
      },
    },
  };
}

export type { GeocodingPluginOptions };
