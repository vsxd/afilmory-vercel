import type { GalleryFilterState } from "~/lib/gallery-filter-url";
import {
  buildGalleryFilterSearch,
  getGalleryFiltersFromSearch,
} from "~/lib/gallery-filter-url";
import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";

export type AppDestination = { pathname: string; search: string };

export function parsePhotoId(pathname: string): string | null {
  const match = /^\/photos\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export const isMapPath = (pathname: string) => /^\/explore\/?$/.test(pathname);
export const gallerySearch = (search: string) =>
  buildGalleryFilterSearch("", getGalleryFiltersFromSearch(search));
export const galleryDestination = (
  filters: GalleryFilterState,
): AppDestination => ({
  pathname: "/",
  search: buildGalleryFilterSearch("", filters),
});

export function mapSearch(search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const key of ["photoId", "regionId", "locationId"] as const) {
    const value = input.get(key);
    if (value) output.set(key, value);
  }
  if (input.get("mode") === "photos") output.set("mode", "photos");
  return output.size > 0 ? `?${output}` : "";
}

export function safeDestination(input: unknown): AppDestination | null {
  if (
    typeof input !== "string" ||
    !input.startsWith("/") ||
    input.startsWith("//")
  )
    return null;
  try {
    const url = new URL(input, "https://afilmory.invalid");
    if (url.origin !== "https://afilmory.invalid") return null;
    if (url.pathname === "/")
      return { pathname: "/", search: gallerySearch(url.search) };
    if (isMapPath(url.pathname))
      return { pathname: "/explore", search: mapSearch(url.search) };
  } catch {
    /* Invalid external input has no navigation authority. */
  }
  return null;
}

export const photoDestination = (id: string, search = ""): AppDestination => ({
  pathname: buildPhotoDetailPathname(id),
  search: gallerySearch(search),
});
export const destinationHref = (destination: AppDestination) =>
  `${destination.pathname}${destination.search}`;
