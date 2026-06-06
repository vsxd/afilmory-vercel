import {
  buildGeoRegionId,
  getGeoLevelValue,
  getPhotoAdminForLevel,
  getRegionAdminPath,
  normalizeDisplayValue,
} from "@afilmory/schema";

import type {
  GeographicRegion,
  GeographicRegionLevel,
  PhotoMarker,
} from "~/types/map";

import { calculateMapBounds } from "./map-utils";

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
    .filter((region): region is GeographicRegion => region !== null)
    .sort((a, b) => {
      const firstIndex = markers.findIndex((marker) =>
        a.photoIds.includes(marker.photo.id),
      );
      const secondIndex = markers.findIndex((marker) =>
        b.photoIds.includes(marker.photo.id),
      );
      return firstIndex - secondIndex;
    });
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
