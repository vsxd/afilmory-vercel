import type { PhotoManifestItem, PickedExif } from "@afilmory/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createExifPanelViewModel } from "../exif-panel-view-model";
import { BasicExifSection } from "../ExifPanelSections";
import type { ExifTranslationAdapter } from "../formatExifData";

const showGallery = vi.fn();
vi.mock("~/navigation/hooks", () => ({
  useAppNavigation: () => ({ showGallery }),
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
      <BasicExifSection
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
});
