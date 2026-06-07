import type { PhotoManifestItem, PickedExif } from "@afilmory/schema";

import { getImageFormat } from "~/lib/image-utils";
import { convertExifGPSToDecimal } from "~/lib/map-utils";

import type { ExifTranslationAdapter } from "./formatExifData";
import { formatExifData } from "./formatExifData";

export function createExifPanelViewModel({
  currentPhoto,
  exifData,
  translator,
}: {
  currentPhoto: PhotoManifestItem;
  exifData: PickedExif | null;
  translator: ExifTranslationAdapter;
}) {
  const formattedExifData = formatExifData(exifData, translator);
  const gpsData = convertExifGPSToDecimal(exifData);
  const decimalLatitude = gpsData?.latitude ?? null;
  const decimalLongitude = gpsData?.longitude ?? null;
  const imageFormat = getImageFormat(
    currentPhoto.originalUrl || currentPhoto.s3Key || "",
  );
  const megaPixels = Math.trunc(
    (currentPhoto.height * currentPhoto.width) / 1_000_000,
  ).toString();

  return {
    decimalLatitude,
    decimalLongitude,
    formattedExifData,
    imageFormat,
    megaPixels,
  };
}

export type ExifPanelViewModel = ReturnType<typeof createExifPanelViewModel>;
