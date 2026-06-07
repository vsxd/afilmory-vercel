import { describe, expect, it } from "vitest";

import type { GallerySetting } from "~/atoms/app";
import type { PhotoManifest } from "~/types/photo";

import {
  applyGalleryCommandAction,
  buildCommandIndex,
  filterCommands,
  getActiveFilterCount,
} from "./model";

const gallerySetting: GallerySetting = {
  sortBy: "date",
  sortOrder: "desc",
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedGeoCountries: [],
  selectedGeoRegions: [],
  selectedGeoCities: [],
  selectedGeoDistricts: [],
  columns: "auto",
};

function t(key: string, options?: Record<string, unknown>): string {
  return options?.title ? `${key}:${options.title}` : key;
}

function createPhoto(overrides: Partial<PhotoManifest> = {}): PhotoManifest {
  return {
    id: "photo",
    title: "Mountains",
    description: "",
    dateTaken: "2026-06-06T00:00:00.000Z",
    tags: ["travel"],
    originalUrl: "https://example.com/photo.jpg",
    thumbnailUrl: "/thumb.jpg",
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: "photo.jpg",
    lastModified: "2026-06-06T00:00:00.000Z",
    size: 100,
    exif: { Model: "A7C" },
    toneAnalysis: null,
    location: null,
    ...overrides,
  };
}

describe("command-palette-model", () => {
  it("counts active filters across filter groups", () => {
    expect(
      getActiveFilterCount({
        ...gallerySetting,
        selectedTags: ["travel"],
        selectedCameras: ["Sony A7C"],
        selectedGeoCities: ["city"],
      }),
    ).toBe(3);
  });

  it("builds pure command data for lens and photo results", () => {
    const commands = buildCommandIndex({
      t,
      language: "en",
      gallerySetting,
      allTags: [],
      allCameras: [],
      allLenses: [
        {
          model: "FE 35mm",
          displayName: "Sony FE 35mm",
        },
      ],
      allPhotos: [createPhoto()],
      geoRegions: {
        country: [],
        region: [],
        city: [],
        district: [],
      },
      query: "mountains",
      hasFilters: false,
    });

    expect(
      commands.find((command) => command.id === "lens-Sony FE 35mm"),
    ).toMatchObject({
      icon: "i-mingcute-camera-2-line",
      action: {
        type: "toggle-lens",
        lens: "Sony FE 35mm",
      },
    });
    expect(
      commands.find((command) => command.id === "photo-photo"),
    ).toMatchObject({
      icon: "photo-thumbnail",
      action: {
        type: "open-photo",
        photoId: "photo",
      },
      thumbnail: {
        photoId: "photo",
        src: "/thumb.jpg",
        alt: "action.search.photo-thumbnail:Mountains",
        thumbHash: null,
      },
    });
  });

  it("filters commands with fuzzy matching", () => {
    expect(
      filterCommands(
        [
          {
            id: "camera",
            type: "filter",
            title: "Sony A7C",
            icon: "camera",
            action: { type: "toggle-camera", camera: "Sony A7C" },
          },
        ],
        "a7c",
      ),
    ).toHaveLength(1);
  });

  it("applies command actions to gallery settings", () => {
    expect(
      applyGalleryCommandAction(gallerySetting, {
        type: "toggle-tag",
        tag: "travel",
      }).selectedTags,
    ).toEqual(["travel"]);

    expect(
      applyGalleryCommandAction(
        {
          ...gallerySetting,
          selectedTags: ["travel"],
        },
        { type: "clear-filters" },
      ),
    ).toMatchObject({
      selectedTags: [],
    });
  });
});
