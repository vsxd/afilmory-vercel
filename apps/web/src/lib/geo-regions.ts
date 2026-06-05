import type { LocationAdminInfo, PhotoManifestItem } from "@afilmory/data";

import type {
  GeographicRegion,
  GeographicRegionLevel,
  PhotoMarker,
} from "~/types/map";

import { calculateMapBounds } from "./map-utils";

export const GEOGRAPHIC_REGION_LEVELS = [
  "country",
  "region",
  "city",
  "district",
] as const satisfies readonly GeographicRegionLevel[];

export type GeoFilterState = {
  selectedGeoCountries: string[];
  selectedGeoRegions: string[];
  selectedGeoCities: string[];
  selectedGeoDistricts: string[];
};

const levelLabels: Record<GeographicRegionLevel, keyof LocationAdminInfo> = {
  country: "country",
  region: "region",
  city: "city",
  district: "district",
};

const previousLevels: Record<GeographicRegionLevel, GeographicRegionLevel[]> = {
  country: [],
  region: ["country"],
  city: ["country", "region"],
  district: ["country", "region", "city"],
};

const normalizeValue = (value: string | undefined): string | undefined => {
  const normalized = value?.trim().replaceAll(/\s+/g, " ");
  return normalized || undefined;
};

const normalizeKey = (value: string | undefined): string | undefined =>
  normalizeValue(value)?.toLocaleLowerCase("en-US");

export const getPhotoAdmin = (
  photo: PhotoManifestItem,
): LocationAdminInfo | null => {
  const { location } = photo;
  if (!location) return null;

  const admin = location.admin ?? {};
  const normalizedAdmin: LocationAdminInfo = {
    country: normalizeValue(admin.country ?? location.country),
    countryCode: normalizeValue(admin.countryCode),
    region: normalizeValue(admin.region),
    city: normalizeValue(admin.city ?? location.city),
    district: normalizeValue(admin.district),
  };

  return Object.values(normalizedAdmin).some(Boolean) ? normalizedAdmin : null;
};

const getLevelValue = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string | undefined => normalizeValue(admin[levelLabels[level]]);

const getCountryKey = (admin: LocationAdminInfo): string | undefined =>
  normalizeKey(admin.countryCode) ?? normalizeKey(admin.country);

const getPathPart = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string | undefined => {
  if (level === "country") {
    return getCountryKey(admin);
  }
  return normalizeKey(getLevelValue(admin, level));
};

export const getRegionAdminPath = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): GeographicRegion["adminPath"] | null => {
  const current = getLevelValue(admin, level);
  if (!current) return null;

  const path: GeographicRegion["adminPath"] = {
    country: normalizeValue(admin.country),
    countryCode: normalizeValue(admin.countryCode),
  };

  if (level === "country") return path;

  path.region = normalizeValue(admin.region);
  if (level === "region") return path;

  path.city = normalizeValue(admin.city);
  if (level === "city") return path;

  path.district = normalizeValue(admin.district);
  return path;
};

export const buildGeoRegionId = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string | null => {
  if (!getLevelValue(admin, level)) return null;

  const levels = [...previousLevels[level], level];
  const parts = levels.flatMap((itemLevel) => {
    const part = getPathPart(admin, itemLevel);
    return part ? [`${itemLevel}=${encodeURIComponent(part)}`] : [];
  });

  if (parts.length === 0) return null;
  return `${level}:${parts.join("|")}`;
};

export const getPhotoRegionIds = (
  photo: PhotoManifestItem,
): Partial<Record<GeographicRegionLevel, string>> => {
  const admin = getPhotoAdmin(photo);
  if (!admin) return {};

  return GEOGRAPHIC_REGION_LEVELS.reduce<
    Partial<Record<GeographicRegionLevel, string>>
  >((ids, level) => {
    const id = buildGeoRegionId(admin, level);
    if (id) ids[level] = id;
    return ids;
  }, {});
};

const createRegionLabel = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string => getLevelValue(admin, level) ?? "Unknown";

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
    const admin = getPhotoAdmin(marker.photo);
    if (!admin) continue;

    const id = buildGeoRegionId(admin, level);
    const adminPath = getRegionAdminPath(admin, level);
    if (!id || !adminPath) continue;

    const existing = groups.get(id);
    if (existing) {
      existing.markers.push(marker);
      continue;
    }

    groups.set(id, {
      label: createRegionLabel(admin, level),
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

export function createRegionMarkers(regions: GeographicRegion[]): PhotoMarker[] {
  return regions.map(createRegionMarker);
}

export function getRegionDisplayName(region: GeographicRegion): string {
  const parts = [
    region.adminPath.country,
    region.adminPath.region,
    region.adminPath.city,
    region.adminPath.district,
  ]
    .flatMap((part) => (part ? [part] : []))
    .filter((part, index, array) => array.indexOf(part) === index);

  return parts.length > 0 ? parts.join(" / ") : region.label;
}

export const getRegionLevelForZoom = (
  zoom: number,
): GeographicRegionLevel => {
  if (zoom < 4) return "country";
  if (zoom < 7) return "region";
  if (zoom < 10) return "city";
  return "district";
};

export const photoMatchesGeoFilters = (
  photo: PhotoManifestItem,
  filters: GeoFilterState,
): boolean => {
  const regionIds = getPhotoRegionIds(photo);

  const matchesLevel = (
    selectedIds: string[],
    level: GeographicRegionLevel,
  ) => selectedIds.length === 0 || selectedIds.includes(regionIds[level] ?? "");

  return (
    matchesLevel(filters.selectedGeoCountries, "country") &&
    matchesLevel(filters.selectedGeoRegions, "region") &&
    matchesLevel(filters.selectedGeoCities, "city") &&
    matchesLevel(filters.selectedGeoDistricts, "district")
  );
};
