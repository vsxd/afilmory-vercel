import { atom } from "jotai";
import {
  atomWithStorage,
  createJSONStorage,
  unstable_withStorageValidator,
} from "jotai/utils";

import { getStorageNS } from "~/lib/ns";

import { isMobileAtom } from "./viewport";

export type GallerySortOrder = "asc" | "desc";
export type GalleryColumns = number | "auto";

export interface GallerySetting {
  sortOrder: GallerySortOrder;
  selectedTags: string[];
  selectedCameras: string[];
  selectedLenses: string[];
  selectedGeoCountries: string[];
  selectedGeoRegions: string[];
  selectedGeoCities: string[];
  selectedGeoDistricts: string[];
}

// Device view preferences are independent of URL-owned gallery filters.
const createGalleryColumnsStorage = (max: number) =>
  unstable_withStorageValidator<GalleryColumns>(
    (value): value is GalleryColumns =>
      value === "auto" ||
      (typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 3 &&
        value <= max),
  )(createJSONStorage());

// Keep the original v1 key as the desktop preference so existing users retain
// their setting. Mobile gets its own bounded value: sharing one scalar lets a
// desktop value such as 8 violate the mobile slider's max=5 contract.
export const galleryColumnsAtom = atomWithStorage<GalleryColumns>(
  getStorageNS("gallery-columns:v1"),
  "auto",
  createGalleryColumnsStorage(8),
);

export const galleryMobileColumnsAtom = atomWithStorage<GalleryColumns>(
  getStorageNS("gallery-columns-mobile:v1"),
  "auto",
  createGalleryColumnsStorage(5),
);

type GalleryColumnsUpdate =
  GalleryColumns | ((previous: GalleryColumns) => GalleryColumns);

/** Reads and writes the preference for the currently active responsive mode. */
export const responsiveGalleryColumnsAtom = atom(
  (get) =>
    get(isMobileAtom) ? get(galleryMobileColumnsAtom) : get(galleryColumnsAtom),
  (get, set, update: GalleryColumnsUpdate) => {
    const target = get(isMobileAtom)
      ? galleryMobileColumnsAtom
      : galleryColumnsAtom;
    const next = typeof update === "function" ? update(get(target)) : update;
    set(target, next);
  },
);

// Command Palette state
export const isCommandPaletteOpenAtom = atom(false);
