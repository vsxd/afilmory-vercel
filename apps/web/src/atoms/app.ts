import { atom } from "jotai";

export type GallerySortBy = "date";
export type GallerySortOrder = "asc" | "desc";

export interface GallerySetting {
  sortBy: GallerySortBy;
  sortOrder: GallerySortOrder;
  selectedTags: string[];
  selectedCameras: string[];
  selectedLenses: string[];
  selectedGeoCountries: string[];
  selectedGeoRegions: string[];
  selectedGeoCities: string[];
  selectedGeoDistricts: string[];
  columns: number | "auto";
}

export const gallerySettingAtom = atom<GallerySetting>({
  sortBy: "date",
  sortOrder: "desc",
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedGeoCountries: [],
  selectedGeoRegions: [],
  selectedGeoCities: [],
  selectedGeoDistricts: [],
  columns: "auto",
});

export const isExiftoolLoadedAtom = atom(false);

// Command Palette state
export const isCommandPaletteOpenAtom = atom(false);
