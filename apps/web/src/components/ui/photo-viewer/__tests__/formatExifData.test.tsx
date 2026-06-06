import type { PickedExif } from "@afilmory/schema";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockI18n = vi.hoisted(() => ({
  exists: vi.fn(() => false),
  language: "en-US",
  t: vi.fn((key: string) => key),
}));

vi.mock("@afilmory/ui", () => ({
  EllipsisHorizontalTextWithTooltip: ({
    children,
  }: {
    children: ReactNode;
  }) => <span>{children}</span>,
}));

vi.mock("~/i18n", () => ({
  getI18n: () => mockI18n,
  i18nAtom: Symbol("i18n"),
}));

describe("formatExifData", () => {
  it("formats standard EXIF date-time strings instead of returning an empty capture time", async () => {
    const { formatExifData } = await import("../formatExifData");

    const result = formatExifData({
      DateTimeOriginal: "2024:08:17 19:42:03",
      OffsetTimeOriginal: "+08:00",
    } as PickedExif);

    expect(result?.dateTime).toEqual(expect.any(String));
    expect(result?.dateTime).not.toBe("");
  });

  it("renders south and west GPS coordinates with signed decimal values", async () => {
    const { formatExifData } = await import("../formatExifData");

    const result = formatExifData({
      GPSLatitude: 33.8568,
      GPSLatitudeRef: "S",
      GPSLongitude: 151.2153,
      GPSLongitudeRef: "W",
    } as PickedExif);

    expect(result?.gps?.latitude).toBe("-33.8568° S");
    expect(result?.gps?.longitude).toBe("-151.2153° W");
  });

  it("keeps zero-valued EXIF fields instead of treating them as missing", async () => {
    const { formatExifData } = await import("../formatExifData");

    const result = formatExifData({
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
    } as PickedExif);

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

    const result = formatExifData({
      FujiRecipe: {
        WhiteBalance: "Daylight",
      },
    } as PickedExif);

    expect(result?.fujiRecipe?.WhiteBalance).toBe("Daylight");
  });
});
