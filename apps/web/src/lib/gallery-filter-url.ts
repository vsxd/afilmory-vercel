import type { GallerySetting } from "~/atoms/app";

export type GalleryFilterState = Pick<
  GallerySetting,
  "selectedTags" | "selectedCameras" | "selectedLenses" | "tagFilterMode"
>;

const getSearchList = (searchParams: URLSearchParams, key: string) =>
  (searchParams.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

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
  const tags = filters.selectedTags.join(",");
  const cameras = filters.selectedCameras.join(",");
  const lenses = filters.selectedLenses.join(",");

  if (tags) searchParams.set("tags", tags);
  else searchParams.delete("tags");

  if (cameras) searchParams.set("cameras", cameras);
  else searchParams.delete("cameras");

  if (lenses) searchParams.set("lenses", lenses);
  else searchParams.delete("lenses");

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
