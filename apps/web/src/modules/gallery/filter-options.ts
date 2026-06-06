import type { CameraInfo, GeoFilterState, LensInfo } from "@afilmory/schema";

import {
  createGeographicRegions,
  getRegionDisplayName,
} from "~/lib/geo-regions";
import { convertPhotosToMarkersFromEXIF } from "~/lib/map-utils";
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

export function createGalleryGeoRegions(
  photos: PhotoManifest[],
): GalleryGeoRegions {
  const markers = convertPhotosToMarkersFromEXIF(photos);
  return {
    country: createGeographicRegions(markers, "country"),
    region: createGeographicRegions(markers, "region"),
    city: createGeographicRegions(markers, "city"),
    district: createGeographicRegions(markers, "district"),
  };
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
  allCameras: CameraInfo[];
  allLenses: LensInfo[];
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
