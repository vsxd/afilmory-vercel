import { describe, expect, it } from "vitest";

import type { GallerySetting } from "~/atoms/app";
import type { PhotoManifest } from "~/types/photo";

import type { Command } from "./model";
import {
  applyGalleryCommandAction,
  buildCommandIndex,
  buildPhotoCommands,
  filterCommands,
  getActiveFilterCount,
  groupCommandResults,
} from "./model";

const gallerySetting: GallerySetting = {
  sortOrder: "desc",
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedGeoCountries: [],
  selectedGeoRegions: [],
  selectedGeoCities: [],
  selectedGeoDistricts: [],
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

  it("matches ASCII metadata independently of the host locale", () => {
    const commands = buildCommandIndex({
      t,
      language: "en",
      gallerySetting,
      allTags: [],
      allCameras: [],
      allLenses: [],
      allPhotos: [createPhoto({ title: "ISTANBUL" })],
      geoRegions: { country: [], region: [], city: [], district: [] },
      query: "istanbul",
      hasFilters: false,
    });

    expect(commands.some((command) => command.id === "photo-photo")).toBe(true);
  });

  it("shows one concise localized location while keeping all languages searchable", () => {
    const photo = createPhoto({
      location: {
        latitude: 31.2,
        longitude: 121.4,
        locationName: "Huangpu, Shanghai, China",
        locationNameI18n: { "zh-CN": "中国上海市黄浦区" },
        adminI18n: {
          en: {
            country: "China",
            region: "Shanghai",
            city: "Shanghai",
            district: "Huangpu",
          },
          "zh-CN": {
            country: "中国",
            region: "上海市",
            city: "上海市",
            district: "黄浦区",
          },
        },
      },
    });
    const commands = buildCommandIndex({
      t,
      language: "zh-CN",
      gallerySetting,
      allTags: [],
      allCameras: [],
      allLenses: [],
      allPhotos: [photo],
      geoRegions: { country: [], region: [], city: [], district: [] },
      query: "Huangpu",
      hasFilters: false,
    });

    expect(groupCommandResults(commands, "Huangpu")).toMatchObject([
      {
        type: "photos",
        commands: [{ id: "photo-photo", subtitle: "上海市 · 黄浦区" }],
      },
    ]);
    expect(commands[0]?.keywords).toEqual(
      expect.arrayContaining(["Shanghai", "Huangpu", "上海市", "黄浦区"]),
    );
    expect(
      buildPhotoCommands({ t, language: "en", photos: [photo] })[0]?.subtitle,
    ).toBe("Shanghai · Huangpu");
    expect(
      buildPhotoCommands({
        t,
        language: "zh-CN",
        photos: [{ ...photo, description: "Morning on the Bund" }],
      })[0]?.subtitle,
    ).toBe("Morning on the Bund");
  });

  it("falls back from a country to a localized location name and camera", () => {
    const countryOnly = createPhoto({
      id: "country",
      location: {
        latitude: 35,
        longitude: 139,
        country: "Japan",
        locationName: "A mountain path",
      },
    });
    const nameOnly = createPhoto({
      id: "name",
      location: {
        latitude: 35,
        longitude: 139,
        locationName: "A mountain path",
        locationNameI18n: { ja: "山道" },
      },
    });

    expect(
      buildPhotoCommands({
        t,
        language: "ja",
        photos: [countryOnly, nameOnly, createPhoto()],
      }).map((command) => command.subtitle),
    ).toEqual(["Japan", "山道", "A7C"]);
  });

  it("reserves photo results when many filters also match", () => {
    const commands = buildCommandIndex({
      t,
      language: "en",
      gallerySetting,
      allTags: Array.from({ length: 25 }, (_, index) => `mountains-${index}`),
      allCameras: [],
      allLenses: [],
      allPhotos: Array.from({ length: 12 }, (_, index) =>
        createPhoto({ id: `${index}` }),
      ),
      geoRegions: { country: [], region: [], city: [], district: [] },
      query: "mountains",
      hasFilters: false,
    });

    const groups = groupCommandResults(commands, "mountains");

    expect(groups.map((group) => group.type)).toEqual(["filters", "photos"]);
    expect(groups[0]?.commands.map((command) => command.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `tag-mountains-${index}`),
    );
    expect(groups[1]?.commands.map((command) => command.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `photo-${index}`),
    );
  });

  it("keeps the original order within each result group", () => {
    const clearCommand: Command = {
      id: "clear",
      type: "action",
      title: "Clear filters",
      icon: "close",
      action: { type: "clear-filters" },
    };
    const tagCommand: Command = {
      id: "tag",
      type: "filter",
      title: "Travel",
      keywords: ["filters"],
      icon: "tag",
      action: { type: "toggle-tag", tag: "travel" },
    };
    const photos = buildPhotoCommands({
      t,
      photos: [createPhoto({ id: "second" }), createPhoto({ id: "first" })],
    });
    const groups = groupCommandResults(
      [photos[0]!, clearCommand, photos[1]!, tagCommand],
      "fltr",
    );

    expect(groups.map((group) => group.commands.map(({ id }) => id))).toEqual([
      ["clear", "tag"],
      ["photo-second", "photo-first"],
    ]);
  });

  it.each(["a7c", "35mm"])(
    "keeps metadata match %j even when absent from the photo label",
    (query) => {
      const commands = buildCommandIndex({
        t,
        language: "en",
        gallerySetting,
        allTags: [],
        allCameras: [],
        allLenses: [],
        allPhotos: [
          createPhoto({
            description: "Morning light",
            exif: { Model: "A7C", LensModel: "FE 35mm" },
          }),
        ],
        geoRegions: { country: [], region: [], city: [], district: [] },
        query,
        hasFilters: false,
      });

      expect(groupCommandResults(commands, query)).toMatchObject([
        { type: "photos", commands: [{ id: "photo-photo" }] },
      ]);
    },
  );

  it("caps prebuilt photo commands independently of filter availability", () => {
    const commands = buildPhotoCommands({
      t,
      photos: Array.from({ length: 15 }, (_, index) =>
        createPhoto({ id: `${index}` }),
      ),
    });

    const groups = groupCommandResults(commands, "mountains");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe("photos");
    expect(groups[0]?.commands).toHaveLength(10);
  });

  it.each(["", "  ", "\t\n"])(
    "does not show result groups for a blank query %j",
    (query) => {
      const commands = buildPhotoCommands({ t, photos: [createPhoto()] });
      expect(groupCommandResults(commands, query)).toEqual([]);
    },
  );

  it("omits groups with no matching results", () => {
    const command: Command = {
      id: "camera",
      type: "filter",
      title: "Sony A7C",
      icon: "camera",
      action: { type: "toggle-camera", camera: "Sony A7C" },
    };

    expect(groupCommandResults([command], "A7C")).toEqual([
      { type: "filters", commands: [command] },
    ]);
    expect(groupCommandResults([command], "no match")).toEqual([]);
    expect(groupCommandResults([], "travel")).toEqual([]);
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
