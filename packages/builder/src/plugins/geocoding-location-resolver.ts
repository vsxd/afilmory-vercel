import { normalizeLocationInfoAdminAliases } from "@afilmory/schema";

import type { GeocodingProvider } from "../photo/geocoding.js";
import {
  extractLocationFromGPS,
  parseGPSCoordinates,
} from "../photo/geocoding.js";
import type { PhotoManifestItem, PickedExif } from "../types/photo.js";
import type {
  GeocodingCacheLogger,
  GeocodingCacheState,
} from "./geocoding-cache.js";
import {
  buildCacheKey,
  composeLocalizedLocation,
  ensurePersistentCacheLoaded,
  hasRequiredLocalizedLocation,
  normalizeCachePath,
  seedCacheEntryFromExistingLocation,
} from "./geocoding-cache.js";
import type { ResolvedGeocodingSettings } from "./geocoding-options.js";

export interface LocationResolutionResult {
  attempted: boolean;
  updated: boolean;
}

export type GeocodingProviderResolver = (
  locale: string,
) => GeocodingProvider | null;

export async function resolveLocationForItem({
  item,
  exif,
  state,
  settings,
  shouldOverwriteExisting,
  logger,
  getProvider,
}: {
  item: PhotoManifestItem;
  exif: PickedExif | null | undefined;
  state: GeocodingCacheState;
  settings: ResolvedGeocodingSettings;
  shouldOverwriteExisting: boolean;
  logger: GeocodingCacheLogger;
  getProvider: GeocodingProviderResolver;
}): Promise<LocationResolutionResult> {
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

    const provider = getProvider(locale);
    if (!provider) {
      continue;
    }

    attempted = true;
    const location = await extractLocationFromGPS(
      latitude,
      longitude,
      provider,
      logger,
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
