import type { PhotoManifestItem, PickedExif } from "@afilmory/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createExifPanelViewModel } from "../exif-panel-view-model";
import { ExifPanelSections } from "../ExifPanelSections";
import type { ExifTranslationAdapter } from "../formatExifData";

const showGallery = vi.fn();
vi.mock("~/navigation/hooks", () => ({
  useAppNavigation: () => ({ showGallery }),
}));
vi.mock("../HistogramChart", () => ({
  HistogramChart: () => <div>Histogram preview</div>,
}));
vi.mock("../MiniMap", () => ({
  MiniMap: ({ photoId }: { photoId: string }) => <div>Map for {photoId}</div>,
}));

const testTranslator: ExifTranslationAdapter = {
  language: "en-US",
  exists: () => false,
  t: (key) => key,
};
const t = (key: string) => key;

function createPhoto(): PhotoManifestItem {
  return {
    id: "photo",
    title: "A7C0001",
    description: "",
    dateTaken: "2026-06-06T00:00:00.000Z",
    tags: ["street", "night"],
    originalUrl: "https://example.com/photo.heic",
    thumbnailUrl: "/thumbnails/photo.jpg",
    thumbHash: null,
    width: 4000,
    height: 3000,
    aspectRatio: 4 / 3,
    s3Key: "photo.heic",
    lastModified: "2026-06-06T00:00:00.000Z",
    size: 4 * 1024 * 1024,
    exif: null,
    toneAnalysis: null,
    location: null,
  };
}

describe("ExifPanel sections", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("builds a view model with format, megapixels, and signed GPS", () => {
    const exif: PickedExif = {
      GPSLatitude: 41.4031,
      GPSLatitudeRef: "S",
      GPSLongitude: 2.174,
      GPSLongitudeRef: "W",
    };

    expect(
      createExifPanelViewModel({
        currentPhoto: createPhoto(),
        exifData: exif,
        translator: testTranslator,
      }),
    ).toMatchObject({
      decimalLatitude: -41.4031,
      decimalLongitude: -2.174,
      imageFormat: "HEIC",
      megaPixels: "12",
    });
  });

  it("renders basic rows and exposes tags as shareable links", async () => {
    const currentPhoto = {
      ...createPhoto(),
      title: "Tokyo-nightwalk_with_a_very_long_original_filename_0001.HEIC",
    };
    const viewModel = createExifPanelViewModel({
      currentPhoto,
      exifData: null,
      translator: testTranslator,
    });

    render(
      <ExifPanelSections
        currentPhoto={currentPhoto}
        t={t}
        viewModel={viewModel}
      />,
    );

    const filename = screen.getByText(currentPhoto.title);
    expect(filename.tagName).toBe("DD");
    expect(filename.previousElementSibling?.textContent).toBe("exif.filename");
    expect(screen.getByText("HEIC")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "street" }).getAttribute("href"),
    ).toBe("/?tags=street");
    fireEvent.click(screen.getByRole("link", { name: "street" }));
    expect(showGallery).toHaveBeenCalledWith(
      expect.objectContaining({ selectedTags: ["street"] }),
    );
  });

  it("puts capture settings and equipment before file details while retaining the other metadata", async () => {
    const currentPhoto: PhotoManifestItem = {
      ...createPhoto(),
      location: {
        latitude: 35.69,
        longitude: 139.7,
        city: "Tokyo",
        country: "Japan",
        locationName: "Shinjuku",
      },
      toneAnalysis: {
        toneType: "low-key",
        brightness: 35,
        contrast: 70,
        shadowRatio: 0.4,
        highlightRatio: 0.1,
      },
    };
    const exif: PickedExif = {
      Make: "FUJIFILM",
      Model: "X-T5",
      LensModel: "XF 35mm F1.4 R",
      FocalLength: "35 mm",
      FocalLengthIn35mmFormat: "53 mm",
      FNumber: 1.4,
      ExposureTime: "1/250",
      ISO: 400,
      ExposureCompensation: 0,
      ExposureMode: "Manual",
      FujiRecipe: { FilmMode: "Classic Chrome" },
      BrightnessValue: 2,
      GPSLatitude: 35.69,
      GPSLongitude: 139.7,
      Artist: "Afilmory",
      Copyright: "All rights reserved",
      Software: "Photo editor",
      ColorSpace: "sRGB",
      DateTimeOriginal: "2026-06-06T18:30:00+09:00",
      zone: "Asia/Tokyo",
    };
    const viewModel = createExifPanelViewModel({
      currentPhoto,
      exifData: exif,
      translator: testTranslator,
    });

    render(
      <ExifPanelSections
        currentPhoto={currentPhoto}
        t={t}
        viewModel={viewModel}
      />,
    );

    const fileHeading = screen.getByRole("heading", {
      name: "exif.basic.info",
    });
    for (const name of ["exif.capture.parameters", "exif.device.info"]) {
      const heading = screen.getByRole("heading", { name });
      expect(
        heading.compareDocumentPosition(fileHeading) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    for (const value of [
      "FUJIFILM X-T5",
      "XF 35mm F1.4 R",
      "f/1.4",
      "1/250s",
      "ISO 400",
      "0 EV",
      "Manual",
      "Classic Chrome",
      "Tokyo, Japan",
      "Shinjuku",
      "2.0 EV",
      "Afilmory",
      "All rights reserved",
      "Photo editor",
      "sRGB",
      "Asia/Tokyo",
      currentPhoto.title,
    ]) {
      expect(screen.getAllByText(value)).toHaveLength(1);
    }
    expect(screen.getByText("exif.capture.time")).toBeTruthy();
    expect(screen.getByText("Histogram preview")).toBeTruthy();
    expect(await screen.findByText("Map for photo")).toBeTruthy();
  });
});
