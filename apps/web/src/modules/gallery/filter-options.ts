import type { CameraInfo, LensInfo } from "@afilmory/schema";
import type { GeoFilterState } from "@afilmory/schema/geo";

import { getPhotoGeoData, getRegionDisplayName } from "~/lib/geo-regions";
import type { GeographicRegion } from "~/types/map";
import type { PhotoManifest } from "~/types/photo";

export type GalleryGeoRegions = Record<
  "country" | "region" | "city" | "district",
  GeographicRegion[]
>;

export type FilterItem = {
  id: string;
  label: string;
};

// Delegates to the WeakMap-memoized geo computation so virtualized remounts
// and the other consumers (header stats, filter panel, map) share one result.
export function createGalleryGeoRegions(
  photos: readonly PhotoManifest[],
): GalleryGeoRegions {
  return getPhotoGeoData(photos).regionsByLevel;
}

export function createGeoRegionLabelMaps(
  geoRegions: GalleryGeoRegions,
  language: string,
): Record<keyof GeoFilterState, Map<string, string>> {
  return {
    selectedGeoCountries: createRegionLabelMap(geoRegions.country, language),
    selectedGeoRegions: createRegionLabelMap(geoRegions.region, language),
    selectedGeoCities: createRegionLabelMap(geoRegions.city, language),
    selectedGeoDistricts: createRegionLabelMap(geoRegions.district, language),
  };
}

export function createGalleryFilterItems(input: {
  allTags: string[];
  allCameras: readonly CameraInfo[];
  allLenses: readonly LensInfo[];
  geoRegions: GalleryGeoRegions;
  language: string;
}): {
  tags: FilterItem[];
  cameras: FilterItem[];
  lenses: FilterItem[];
  countries: FilterItem[];
  cities: FilterItem[];
} {
  const { allTags, allCameras, allLenses, geoRegions, language } = input;

  return {
    tags: allTags.map((tag) => ({ id: tag, label: tag })),
    cameras: allCameras.map((camera) => ({
      id: camera.displayName,
      label: camera.displayName,
    })),
    lenses: allLenses.map((lens) => ({
      id: lens.displayName,
      label: lens.displayName,
    })),
    countries: createRegionItems(geoRegions.country, language),
    cities: createRegionItems(geoRegions.city, language),
  };
}

function createRegionLabelMap(
  regions: GeographicRegion[],
  language: string,
): Map<string, string> {
  return new Map(
    regions.map((region) => [
      region.id,
      getRegionDisplayName(region, language),
    ]),
  );
}

function createRegionItems(
  regions: GeographicRegion[],
  language: string,
): FilterItem[] {
  return regions.map((region) => ({
    id: region.id,
    label: getRegionDisplayName(region, language),
  }));
}
