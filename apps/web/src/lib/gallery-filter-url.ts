import type { GallerySetting } from "~/atoms/app";

export type GalleryFilterState = Pick<
  GallerySetting,
  | "selectedTags"
  | "selectedCameras"
  | "selectedLenses"
  | "selectedGeoCountries"
  | "selectedGeoRegions"
  | "selectedGeoCities"
  | "selectedGeoDistricts"
>;

const getSearchList = (searchParams: URLSearchParams, key: string) => {
  const values = searchParams.getAll(key);
  if (values.length > 1) {
    return values.map((value) => value.trim()).filter(Boolean);
  }

  return (values[0] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

const setSearchList = (
  searchParams: URLSearchParams,
  key: string,
  values: string[],
) => {
  searchParams.delete(key);

  for (const value of values) {
    searchParams.append(key, value);
  }

  if (values.length === 1 && values[0].includes(",")) {
    searchParams.append(key, "");
  }
};

const toSearchParams = (search: string | URLSearchParams) =>
  typeof search === "string"
    ? new URLSearchParams(search)
    : new URLSearchParams(search);

const appendUnique = (values: string[], value: string | null) => {
  const trimmed = value?.trim();
  if (trimmed && !values.includes(trimmed)) values.push(trimmed);
};

const applyRegionIdParam = (
  filters: GalleryFilterState,
  regionId: string | null,
) => {
  const trimmed = regionId?.trim();
  if (!trimmed) return;

  if (trimmed.startsWith("country:")) {
    appendUnique(filters.selectedGeoCountries, trimmed);
    return;
  }

  if (trimmed.startsWith("region:")) {
    appendUnique(filters.selectedGeoRegions, trimmed);
    return;
  }

  if (trimmed.startsWith("city:")) {
    appendUnique(filters.selectedGeoCities, trimmed);
    return;
  }

  if (trimmed.startsWith("district:")) {
    appendUnique(filters.selectedGeoDistricts, trimmed);
  }
};

export const getGalleryFiltersFromSearch = (
  search: string | URLSearchParams,
): GalleryFilterState => {
  const searchParams = toSearchParams(search);
  const filters: GalleryFilterState = {
    selectedTags: getSearchList(searchParams, "tags"),
    selectedCameras: getSearchList(searchParams, "cameras"),
    selectedLenses: getSearchList(searchParams, "lenses"),
    selectedGeoCountries: getSearchList(searchParams, "geo_country"),
    selectedGeoRegions: getSearchList(searchParams, "geo_region"),
    selectedGeoCities: getSearchList(searchParams, "geo_city"),
    selectedGeoDistricts: getSearchList(searchParams, "geo_district"),
  };

  applyRegionIdParam(filters, searchParams.get("regionId"));
  return filters;
};

export const applyGalleryFiltersToSearch = (
  search: string | URLSearchParams,
  filters: GalleryFilterState,
): URLSearchParams => {
  const searchParams = toSearchParams(search);
  setSearchList(searchParams, "tags", filters.selectedTags);
  setSearchList(searchParams, "cameras", filters.selectedCameras);
  setSearchList(searchParams, "lenses", filters.selectedLenses);
  setSearchList(searchParams, "geo_country", filters.selectedGeoCountries);
  setSearchList(searchParams, "geo_region", filters.selectedGeoRegions);
  setSearchList(searchParams, "geo_city", filters.selectedGeoCities);
  setSearchList(searchParams, "geo_district", filters.selectedGeoDistricts);
  searchParams.delete("regionId");
  searchParams.delete("tag_mode");

  return searchParams;
};

export const buildGalleryFilterSearch = (
  search: string | URLSearchParams,
  filters: GalleryFilterState,
): string => {
  const nextSearch = applyGalleryFiltersToSearch(search, filters).toString();
  return nextSearch ? `?${nextSearch}` : "";
};

export const buildSingleTagFilterSearch = (tag: string): string =>
  buildGalleryFilterSearch("", {
    selectedTags: [tag],
    selectedCameras: [],
    selectedLenses: [],
    selectedGeoCountries: [],
    selectedGeoRegions: [],
    selectedGeoCities: [],
    selectedGeoDistricts: [],
  });
