import type { PhotoManifestItem, PickedExif } from "@afilmory/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import type { ComponentPropsWithoutRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { createExifPanelViewModel } from "../exif-panel-view-model";
import { BasicExifSection } from "../ExifPanelSections";

vi.mock("@afilmory/ui", () => ({
  EllipsisHorizontalTextWithTooltip: ({
    children,
    ...props
  }: ComponentPropsWithoutRef<"span">) => <span {...props}>{children}</span>,
  MotionButtonBase: ({
    children,
    ...props
  }: ComponentPropsWithoutRef<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

const t = ((key: string) => key) as unknown as TFunction<"app">;

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
      }),
    ).toMatchObject({
      decimalLatitude: -41.4031,
      decimalLongitude: -2.174,
      imageFormat: "HEIC",
      megaPixels: "12",
    });
  });

  it("renders basic rows and delegates tag clicks to the injected callback", async () => {
    const onTagClick = vi.fn();
    const currentPhoto = createPhoto();
    const viewModel = createExifPanelViewModel({
      currentPhoto,
      exifData: null,
    });

    render(
      <BasicExifSection
        currentPhoto={currentPhoto}
        onTagClick={onTagClick}
        t={t}
        viewModel={viewModel}
      />,
    );

    expect(screen.getByText("A7C0001")).toBeTruthy();
    expect(screen.getByText("HEIC")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "street" }));
    expect(onTagClick).toHaveBeenCalledWith("street");
  });
});
