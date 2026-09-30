import { MediaTaskError } from "../../media-task";

export interface TiffDecodeBudget {
  maxBytes: number;
  maxDimension: number;
}

export const MOBILE_TIFF_BUDGET: Readonly<TiffDecodeBudget> = {
  maxBytes: 128 * 1024 * 1024,
  maxDimension: 8192,
};
export const DESKTOP_TIFF_BUDGET: Readonly<TiffDecodeBudget> = {
  maxBytes: 384 * 1024 * 1024,
  maxDimension: 16384,
};

export function tiffResourceLimit(): MediaTaskError {
  return new MediaTaskError(
    "convert",
    "resource-limit",
    "TIFF exceeds the image conversion memory budget",
  );
}

/** Bound the input copy before reading its metadata or creating a worker. */
export function assertTiffInputSize(size: number, budget: TiffDecodeBudget) {
  if (!Number.isSafeInteger(size) || size < 0 || size * 2 > budget.maxBytes)
    throw tiffResourceLimit();
}
