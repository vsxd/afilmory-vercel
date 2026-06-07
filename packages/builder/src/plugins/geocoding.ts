import type { EmitPluginEventFn } from "../core/contracts/execution-context.js";
import type { BuilderServices } from "../core/contracts/services.js";
import type { Logger } from "../logger/index.js";
import {
  createStorageKeyNormalizer,
  getPhotoExecutionContext,
  runWithPhotoExecutionContext,
} from "../photo/execution-context.js";
import type { GeocodingProvider } from "../photo/geocoding.js";
import { createGeocodingProvider } from "../photo/geocoding.js";
import { createPhotoProcessingLoggers } from "../photo/logger-adapter.js";
import type { GeocodingCacheState } from "./geocoding-cache.js";
import {
  createGeocodingCacheState,
  hasRequiredLocalizedLocation,
  normalizeCachePath,
  savePersistentCacheIfNeeded,
} from "./geocoding-cache.js";
import { resolveLocationForItem } from "./geocoding-location-resolver.js";
import type {
  GeocodingPluginOptions,
  ResolvedGeocodingSettings,
} from "./geocoding-options.js";
import {
  createResolvedGeocodingSettings,
  resolveGeocodingOptions,
} from "./geocoding-options.js";
import type { BuilderPlugin } from "./types.js";

const PLUGIN_NAME = "afilmory:geocoding";
const RUN_STATE_KEY = "geocodingState";

type LocationLogger = Logger["main"];

interface GeocodingState {
  providers: Map<string, GeocodingProvider>;
  cache: GeocodingCacheState;
}

function getOrCreateState(runShared: Map<string, unknown>): GeocodingState {
  const existing = runShared.get(RUN_STATE_KEY) as GeocodingState | undefined;
  if (existing) {
    return existing;
  }

  const next: GeocodingState = {
    providers: new Map(),
    cache: createGeocodingCacheState(),
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

export default function geocodingPlugin(
  options: GeocodingPluginOptions = {},
): BuilderPlugin {
  const normalizedOptions = resolveGeocodingOptions(options);
  let settings: ResolvedGeocodingSettings | null = null;

  return {
    name: PLUGIN_NAME,
    hooks: {
      onInit: () => {
        settings = createResolvedGeocodingSettings(normalizedOptions);
      },
      afterPhotoProcess: async ({
        services,
        emitPluginEvent,
        payload,
        runShared,
        logger,
      }) => {
        if (!settings || !normalizedOptions.enable) return;

        const { item } = payload.result;
        if (!item) return;

        const shouldOverwriteExisting =
          payload.options.isForceMode || payload.options.isForceManifest;
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
            await resolveLocationForItem({
              item,
              exif,
              state: state.cache,
              settings: currentSettings,
              shouldOverwriteExisting,
              logger: locationLogger,
              getProvider: (locale) =>
                ensureProvider(state, currentSettings, locale, locationLogger),
            });
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
                await resolveLocationForItem({
                  item,
                  exif: item.exif,
                  state: state.cache,
                  settings: currentSettings,
                  shouldOverwriteExisting,
                  logger: locationLogger,
                  getProvider: (locale) =>
                    ensureProvider(
                      state,
                      currentSettings,
                      locale,
                      locationLogger,
                    ),
                });

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
              state.cache,
              normalizeCachePath(currentSettings.cachePath),
              locationLogger,
            );
          },
        );
      },
    },
  };
}

export {
  composeLocalizedLocation,
  migrateV1CacheEntry,
  seedCacheEntryFromExistingLocation,
} from "./geocoding-cache.js";
export {
  type GeocodingPluginOptions,
  normalizeGeocodingLocales,
} from "./geocoding-options.js";
