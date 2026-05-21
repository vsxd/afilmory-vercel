import type { PickedExif } from "@afilmory/data";
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
  i18nAtom: Symbol("i18n"),
}));

vi.mock("~/lib/jotai", () => ({
  jotaiStore: {
    get: () => mockI18n,
  },
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
});
