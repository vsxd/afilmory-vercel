import {
  buildGeoRegionId,
  getGeoLevelValue,
  getPhotoAdminForLevel,
  getRegionAdminPath,
  normalizeDisplayValue,
} from "@afilmory/schema/geo";

import type {
  GeographicRegion,
  GeographicRegionLevel,
  PhotoMarker,
} from "~/types/map";
import type { PhotoManifest } from "~/types/photo";

import {
  calculateMapBounds,
  convertPhotosToMarkersFromEXIF,
} from "./map-utils";

const createRegionLabel = (
  admin: Parameters<typeof getRegionAdminPath>[0],
  level: GeographicRegionLevel,
): string => getGeoLevelValue(admin, level) ?? "Unknown";

export function createGeographicRegions(
  markers: PhotoMarker[],
  level: GeographicRegionLevel,
): GeographicRegion[] {
  const groups = new Map<
    string,
    {
      label: string;
      adminPath: GeographicRegion["adminPath"];
      markers: PhotoMarker[];
    }
  >();

  for (const marker of markers) {
    const adminKey = getPhotoAdminForLevel(marker.photo, level);
    if (!adminKey) continue;

    const id = buildGeoRegionId(adminKey, level);
    const adminPath = getRegionAdminPath(adminKey, level);
    if (!id || !adminPath) continue;

    const existing = groups.get(id);
    if (existing) {
      existing.markers.push(marker);
      continue;
    }

    groups.set(id, {
      label: createRegionLabel(adminKey, level),
      adminPath,
      markers: [marker],
    });
  }

  // Regions come out ordered by first marker appearance for free: each group
  // is inserted into the Map when its first marker is encountered, and Map
  // iteration preserves insertion order — no sort needed.
  return Array.from(groups.entries())
    .map(([id, group]): GeographicRegion | null => {
      const bounds = calculateMapBounds(group.markers);
      const representativeMarker = group.markers[0];
      if (!bounds || !representativeMarker) return null;

      return {
        id,
        level,
        label: group.label,
        adminPath: group.adminPath,
        longitude: bounds.centerLng,
        latitude: bounds.centerLat,
        photoIds: group.markers.map((marker) => marker.photo.id),
        photoCount: group.markers.length,
        representativeMarker,
        markers: group.markers,
        bounds,
      };
    })
    .filter((region): region is GeographicRegion => region !== null);
}

export type GeoRegionsByLevel = Record<
  GeographicRegionLevel,
  GeographicRegion[]
>;

export type PhotoGeoData = {
  markers: PhotoMarker[];
  regionsByLevel: GeoRegionsByLevel;
};

// Full-library EXIF-GPS parsing + 4-level region grouping is expensive, and the
// callers (virtualized gallery header, filter panel, /explore map) all derive it
// from the same stable PhotoRepository array. Memoize by array identity — same
// pattern as filterAndSortPhotos' WeakMap memo — so remounts are cache hits and
// the WeakMap never keeps a stale manifest alive.
const photoGeoDataCache = new WeakMap<readonly PhotoManifest[], PhotoGeoData>();

export function getPhotoGeoData(
  photos: readonly PhotoManifest[],
): PhotoGeoData {
  const cached = photoGeoDataCache.get(photos);
  if (cached) return cached;

  const markers = convertPhotosToMarkersFromEXIF(photos);
  const data: PhotoGeoData = {
    markers,
    regionsByLevel: {
      country: createGeographicRegions(markers, "country"),
      region: createGeographicRegions(markers, "region"),
      city: createGeographicRegions(markers, "city"),
      district: createGeographicRegions(markers, "district"),
    },
  };
  photoGeoDataCache.set(photos, data);
  return data;
}

export function createRegionMarker(region: GeographicRegion): PhotoMarker {
  return {
    ...region.representativeMarker,
    id: region.id,
    longitude: region.longitude,
    latitude: region.latitude,
  };
}

export function createRegionMarkers(
  regions: GeographicRegion[],
): PhotoMarker[] {
  return regions.map(createRegionMarker);
}

export function getRegionDisplayName(
  region: GeographicRegion,
  language?: string,
): string {
  const displayAdmin = getPhotoAdminForLevel(
    region.representativeMarker.photo,
    region.level,
    language,
  );
  const displayPath = displayAdmin
    ? getRegionAdminPath(displayAdmin, region.level)
    : null;
  const adminPath = displayPath ?? region.adminPath;
  const parts = [
    adminPath.country,
    adminPath.region,
    adminPath.city,
    adminPath.district,
  ]
    .flatMap((part) => {
      const normalized = normalizeDisplayValue(part, language);
      return normalized ? [normalized] : [];
    })
    .filter((part, index, array) => array.indexOf(part) === index);

  return (
    parts.join(" / ") ||
    normalizeDisplayValue(region.label, language) ||
    region.label
  );
}

export const getRegionLevelForZoom = (zoom: number): GeographicRegionLevel => {
  if (zoom < 4) return "country";
  if (zoom < 7) return "region";
  if (zoom < 10) return "city";
  return "district";
};
