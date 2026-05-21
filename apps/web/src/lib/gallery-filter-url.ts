import type { GallerySetting } from "~/atoms/app";

export type GalleryFilterState = Pick<
  GallerySetting,
  "selectedTags" | "selectedCameras" | "selectedLenses" | "tagFilterMode"
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

export const getGalleryFiltersFromSearch = (
  search: string | URLSearchParams,
): GalleryFilterState => {
  const searchParams = toSearchParams(search);
  const tagModeFromSearchParams = searchParams.get("tag_mode") as
    | "union"
    | "intersection"
    | null;

  return {
    selectedTags: getSearchList(searchParams, "tags"),
    selectedCameras: getSearchList(searchParams, "cameras"),
    selectedLenses: getSearchList(searchParams, "lenses"),
    tagFilterMode:
      tagModeFromSearchParams === "intersection" ? "intersection" : "union",
  };
};

export const applyGalleryFiltersToSearch = (
  search: string | URLSearchParams,
  filters: GalleryFilterState,
): URLSearchParams => {
  const searchParams = toSearchParams(search);
  setSearchList(searchParams, "tags", filters.selectedTags);
  setSearchList(searchParams, "cameras", filters.selectedCameras);
  setSearchList(searchParams, "lenses", filters.selectedLenses);

  if (filters.tagFilterMode === "intersection")
    searchParams.set("tag_mode", "intersection");
  else searchParams.delete("tag_mode");

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
    tagFilterMode: "union",
  });
