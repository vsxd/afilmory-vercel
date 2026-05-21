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
  LocationInfo,
  PhotoManifestItem,
  PickedExif,
} from "../types/photo.js";
import type { BuilderPlugin } from "./types.js";

const PLUGIN_NAME = "afilmory:geocoding";
const RUN_STATE_KEY = "geocodingState";
const DEFAULT_CACHE_PRECISION = 4;

interface GeocodingPluginOptions {
  enable?: boolean;
  provider?: "mapbox" | "nominatim" | "auto";
  mapboxToken?: string;
  nominatimBaseUrl?: string;
  cachePrecision?: number;
  /**
   * Preferred languages for geocoding results (BCP47). Accepts comma-separated string or array.
   */
  language?: string | string[];
}
type GeocodingPluginOptionsResolved = Required<
  Pick<GeocodingPluginOptions, "enable" | "provider">
> &
  Pick<
    GeocodingPluginOptions,
    "mapboxToken" | "nominatimBaseUrl" | "cachePrecision"
  > & {
    language: string | null;
  };

interface ResolvedGeocodingSettings {
  provider: "mapbox" | "nominatim" | "auto";
  mapboxToken?: string;
  nominatimBaseUrl?: string;
  cachePrecision: number;
  language: string | null;
}

interface GeocodingState {
  provider: GeocodingProvider | null;
  providerKey: string | null;
  cache: Map<string, LocationInfo | null>;
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

function normalizeLanguage(
  value: string | string[] | undefined,
): string | null {
  if (!value) return null;
  const parts = Array.isArray(value) ? value : String(value).split(",");
  const normalized = parts.map((v) => v.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join(",") : null;
}

function resolveSettings(
  options: GeocodingPluginOptions,
): GeocodingPluginOptionsResolved {
  return {
    enable: options.enable ?? false,
    provider: options.provider ?? "auto",
    mapboxToken: options.mapboxToken,
    nominatimBaseUrl: options.nominatimBaseUrl,
    cachePrecision: normalizeCachePrecision(
      options.cachePrecision ?? DEFAULT_CACHE_PRECISION,
    ),
    language: normalizeLanguage(options.language),
  };
}

function getOrCreateState(runShared: Map<string, unknown>): GeocodingState {
  const existing = runShared.get(RUN_STATE_KEY) as GeocodingState | undefined;
  if (existing) {
    return existing;
  }

  const next: GeocodingState = {
    provider: null,
    providerKey: null,
    cache: new Map(),
  };
  runShared.set(RUN_STATE_KEY, next);
  return next;
}

function buildProviderKey(settings: ResolvedGeocodingSettings): string {
  return `${settings.provider}:${settings.mapboxToken ?? ""}:${settings.nominatimBaseUrl ?? ""}:${settings.language ?? ""}`;
}

function ensureProvider(
  state: GeocodingState,
  settings: ResolvedGeocodingSettings,
  logger: LocationLogger,
): GeocodingProvider | null {
  const providerKey = buildProviderKey(settings);
  if (state.provider && state.providerKey === providerKey) {
    return state.provider;
  }

  if (state.providerKey && state.providerKey !== providerKey) {
    state.cache.clear();
  }

  const provider = createGeocodingProvider(
    settings.provider,
    settings.mapboxToken,
    settings.nominatimBaseUrl,
    settings.language ?? undefined,
  );

  if (!provider) {
    logger.warn("无法创建地理编码提供者，请检查 geocoding 配置和 Token");
    state.provider = null;
    state.providerKey = null;
    return null;
  }

  state.provider = provider;
  state.providerKey = providerKey;
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
  precision: number,
): string {
  return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
}

async function resolveLocationForItem(
  item: PhotoManifestItem,
  exif: PickedExif | null | undefined,
  state: GeocodingState,
  settings: ResolvedGeocodingSettings,
  provider: GeocodingProvider,
  shouldOverwriteExisting: boolean,
): Promise<LocationResolutionResult> {
  if (item.location && !shouldOverwriteExisting) {
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

  const cacheKey = buildCacheKey(latitude, longitude, settings.cachePrecision);
  const cached = state.cache.get(cacheKey);
  if (cached !== undefined) {
    if (cached) {
      item.location = cached;
      return { attempted: true, updated: true };
    }
    if (shouldOverwriteExisting) {
      item.location = null;
    }
    return { attempted: true, updated: false };
  }

  const location = await extractLocationFromGPS(latitude, longitude, provider);
  state.cache.set(cacheKey, location ?? null);

  if (location) {
    item.location = location;
    return { attempted: true, updated: true };
  }

  if (shouldOverwriteExisting) {
    item.location = null;
  }

  return { attempted: true, updated: false };
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
          cachePrecision:
            normalizedOptions.cachePrecision ?? DEFAULT_CACHE_PRECISION,
          language: normalizedOptions.language,
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

        // 当已有位置信息且未强制刷新时，不重复调用地理编码
        if (item.location && !shouldOverwriteExisting) {
          return;
        }

        const currentSettings = settings;

        await ensurePhotoContext(
          services,
          emitPluginEvent,
          logger,
          async () => {
            const state = getOrCreateState(runShared);
            const locationLogger = logger.main.withTag("LOCATION");
            const provider = ensureProvider(
              state,
              currentSettings,
              locationLogger,
            );
            if (!provider) {
              if (shouldOverwriteExisting) {
                item.location = null;
              }
              return;
            }

            const exif =
              item.exif ?? payload.context.existingItem?.exif ?? null;
            await resolveLocationForItem(
              item,
              exif,
              state,
              currentSettings,
              provider,
              shouldOverwriteExisting,
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
        const provider = ensureProvider(state, currentSettings, locationLogger);
        if (!provider) {
          return;
        }

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
              if (item.location) continue;

              const { attempted: didAttempt, updated: didUpdate } =
                await resolveLocationForItem(
                  item,
                  item.exif,
                  state,
                  currentSettings,
                  provider,
                  shouldOverwriteExisting,
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
          },
        );
      },
    },
  };
}

export type { GeocodingPluginOptions };
