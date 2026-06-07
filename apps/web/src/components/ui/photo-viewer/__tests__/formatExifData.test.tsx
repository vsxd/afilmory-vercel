import type { PickedExif } from "@afilmory/schema";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ExifTranslationAdapter } from "../formatExifData";

vi.mock("@afilmory/ui", () => ({
  EllipsisHorizontalTextWithTooltip: ({
    children,
  }: {
    children: ReactNode;
  }) => <span>{children}</span>,
}));

const testTranslator: ExifTranslationAdapter = {
  language: "en-US",
  exists: () => false,
  t: (key) => key,
};

describe("formatExifData", () => {
  it("formats standard EXIF date-time strings instead of returning an empty capture time", async () => {
    const { formatExifData } = await import("../formatExifData");
    const exif: PickedExif = {
      DateTimeOriginal: "2024:08:17 19:42:03",
      OffsetTimeOriginal: "+08:00",
    };

    const result = formatExifData(exif, testTranslator);

    expect(result?.dateTime).toEqual(expect.any(String));
    expect(result?.dateTime).not.toBe("");
  });

  it("renders south and west GPS coordinates with signed decimal values", async () => {
    const { formatExifData } = await import("../formatExifData");
    const exif: PickedExif = {
      GPSLatitude: 33.8568,
      GPSLatitudeRef: "S",
      GPSLongitude: 151.2153,
      GPSLongitudeRef: "W",
    };

    const result = formatExifData(exif, testTranslator);

    expect(result?.gps?.latitude).toBe("-33.8568° S");
    expect(result?.gps?.longitude).toBe("-151.2153° W");
  });

  it("keeps zero-valued EXIF fields instead of treating them as missing", async () => {
    const { formatExifData } = await import("../formatExifData");
    const exif: PickedExif = {
      ExposureCompensation: 0,
      BrightnessValue: 0,
      ApertureValue: 0,
      WhiteBalanceBias: 0,
      WBShiftAB: 0,
      WBShiftGM: 0,
      FocalPlaneXResolution: 0,
      FocalPlaneYResolution: 0,
      GPSAltitude: 0,
      GPSLatitude: 1,
      GPSLongitude: 2,
    };

    const result = formatExifData(exif, testTranslator);

    expect(result?.exposureBias).toBe("0 EV");
    expect(result?.brightnessValue).toBe("0.0 EV");
    expect(result?.apertureValue).toBe("0.0 EV");
    expect(result?.whiteBalanceBias).toBe(0);
    expect(result?.wbShiftAB).toBe(0);
    expect(result?.wbShiftGM).toBe(0);
    expect(result?.focalPlaneXResolution).toBe(0);
    expect(result?.focalPlaneYResolution).toBe(0);
    expect(result?.gps?.altitude).toBe("0");
  });

  it("keeps the actual Fuji white balance value for non-Kelvin recipes", async () => {
    const { formatExifData } = await import("../formatExifData");
    const exif: PickedExif = {
      FujiRecipe: {
        WhiteBalance: "Daylight",
      },
    };

    const result = formatExifData(exif, testTranslator);

    expect(result?.fujiRecipe?.WhiteBalance).toBe("Daylight");
  });
});
