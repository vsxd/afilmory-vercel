import type { CameraInfo, GeoFilterState, LensInfo } from "@afilmory/schema";

import type { GallerySetting } from "~/atoms/app";
import { getRegionDisplayName } from "~/lib/geo-regions";
import type { GeographicRegion } from "~/types/map";
import type { PhotoManifest } from "~/types/photo";

import { fuzzyMatch, getLocationTokens, searchPhotos } from "./search";

export type CommandType = "search" | "filter" | "action" | "photo";

export interface Command {
  id: string;
  type: CommandType;
  title: string;
  subtitle?: string;
  icon: string;
  action: CommandAction;
  keywords?: string[];
  badge?: string | number;
  active?: boolean;
  thumbnail?: {
    photoId: string;
    src: string;
    alt: string;
    thumbHash?: string | null;
  };
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  icon: string;
  action: CommandAction;
}

type GalleryTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;
type GeoFilterField = keyof GeoFilterState;

export type CommandAction =
  | { type: "toggle-tag"; tag: string }
  | { type: "toggle-camera"; camera: string }
  | { type: "toggle-lens"; lens: string }
  | { type: "toggle-geo"; field: GeoFilterField; id: string }
  | { type: "clear-filters" }
  | { type: "open-photo"; photoId: string };

export type CommandGeoRegions = Record<
  "country" | "region" | "city" | "district",
  GeographicRegion[]
>;

export function getActiveFilterCount(gallerySetting: GallerySetting): number {
  return (
    gallerySetting.selectedTags.length +
    gallerySetting.selectedCameras.length +
    gallerySetting.selectedLenses.length +
    gallerySetting.selectedGeoCountries.length +
    gallerySetting.selectedGeoRegions.length +
    gallerySetting.selectedGeoCities.length +
    gallerySetting.selectedGeoDistricts.length
  );
}

export function getAvailableFilterCount(input: {
  allTags: string[];
  allCameras: CameraInfo[];
  allLenses: LensInfo[];
  geoRegions: CommandGeoRegions;
}): number {
  return (
    input.allTags.length +
    input.allCameras.length +
    input.allLenses.length +
    input.geoRegions.country.length +
    input.geoRegions.region.length +
    input.geoRegions.city.length +
    input.geoRegions.district.length
  );
}

export function buildActiveFilterChips(input: {
  gallerySetting: GallerySetting;
  regionLabelMaps: Record<keyof GeoFilterState, Map<string, string>>;
}): ActiveFilterChip[] {
  const { gallerySetting, regionLabelMaps } = input;

  return [
    ...gallerySetting.selectedTags.map((tag) => ({
      id: `tag-${tag}`,
      label: tag,
      icon: "i-mingcute-tag-line",
      action: { type: "toggle-tag", tag } satisfies CommandAction,
    })),
    ...gallerySetting.selectedCameras.map((camera) => ({
      id: `camera-${camera}`,
      label: camera,
      icon: "i-mingcute-camera-line",
      action: { type: "toggle-camera", camera } satisfies CommandAction,
    })),
    ...gallerySetting.selectedLenses.map((lens) => ({
      id: `lens-${lens}`,
      label: lens,
      icon: "i-mingcute-camera-2-line",
      action: { type: "toggle-lens", lens } satisfies CommandAction,
    })),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoCountries,
      labelMap: regionLabelMaps.selectedGeoCountries,
      prefix: "geo-country",
      icon: "i-mingcute-world-line",
      field: "selectedGeoCountries",
    }),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoRegions,
      labelMap: regionLabelMaps.selectedGeoRegions,
      prefix: "geo-region",
      icon: "i-mingcute-map-pin-line",
      field: "selectedGeoRegions",
    }),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoCities,
      labelMap: regionLabelMaps.selectedGeoCities,
      prefix: "geo-city",
      icon: "i-mingcute-building-5-line",
      field: "selectedGeoCities",
    }),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoDistricts,
      labelMap: regionLabelMaps.selectedGeoDistricts,
      prefix: "geo-district",
      icon: "i-mingcute-map-pin-line",
      field: "selectedGeoDistricts",
    }),
  ];
}

export function buildCommandIndex(input: {
  t: GalleryTranslation;
  language: string;
  gallerySetting: GallerySetting;
  allTags: string[];
  allCameras: CameraInfo[];
  allLenses: LensInfo[];
  allPhotos: PhotoManifest[];
  geoRegions: CommandGeoRegions;
  query: string;
  hasFilters: boolean;
}): Command[] {
  const {
    t,
    language,
    gallerySetting,
    allTags,
    allCameras,
    allLenses,
    allPhotos,
    geoRegions,
    query,
    hasFilters,
  } = input;
  const commands: Command[] = [];

  for (const tag of allTags) {
    const isActive = gallerySetting.selectedTags.includes(tag);
    commands.push({
      id: `tag-${tag}`,
      type: "filter",
      title: tag,
      subtitle: t("action.tag.filter"),
      icon: "i-mingcute-tag-line",
      active: isActive,
      action: { type: "toggle-tag", tag },
      keywords: ["tag", "filter", tag],
    });
  }

  for (const camera of allCameras) {
    const isActive = gallerySetting.selectedCameras.includes(
      camera.displayName,
    );
    commands.push({
      id: `camera-${camera.displayName}`,
      type: "filter",
      title: camera.displayName,
      subtitle: t("action.camera.filter"),
      icon: "i-mingcute-camera-line",
      active: isActive,
      action: { type: "toggle-camera", camera: camera.displayName },
      keywords: [
        "camera",
        "filter",
        camera.displayName,
        camera.make,
        camera.model,
      ],
    });
  }

  for (const lens of allLenses) {
    const isActive = gallerySetting.selectedLenses.includes(lens.displayName);
    commands.push({
      id: `lens-${lens.displayName}`,
      type: "filter",
      title: lens.displayName,
      subtitle: t("action.lens.filter"),
      icon: "i-mingcute-camera-2-line",
      active: isActive,
      action: { type: "toggle-lens", lens: lens.displayName },
      keywords: ["lens", "filter", lens.displayName],
    });
  }

  addGeoCommands({
    commands,
    t,
    language,
    geoRegions,
    gallerySetting,
  });

  if (hasFilters) {
    commands.push({
      id: "clear-filters",
      type: "action",
      title: t("action.search.clear"),
      subtitle: t("action.search.clear-filters-subtitle"),
      icon: "i-mingcute-close-line",
      action: { type: "clear-filters" },
      keywords: ["clear", "reset", "remove", "filter"],
    });
  }

  if (query.trim()) {
    for (const photo of searchPhotos(allPhotos, query).slice(0, 10)) {
      const locationTokens = getLocationTokens(photo.location);
      const locationSubtitle = locationTokens.join(", ");
      commands.push({
        id: `photo-${photo.id}`,
        type: "photo",
        title: photo.title || photo.id,
        subtitle:
          photo.description ||
          locationSubtitle ||
          `${photo.exif?.Model || t("action.search.photo")}`,
        icon: "photo-thumbnail",
        thumbnail: {
          photoId: photo.id,
          src: photo.thumbnailUrl,
          alt: t("action.search.photo-thumbnail", {
            title: photo.title || photo.id,
          }),
          thumbHash: photo.thumbHash,
        },
        action: { type: "open-photo", photoId: photo.id },
        keywords: [
          photo.title,
          photo.description,
          ...locationTokens,
          ...(photo.tags || []),
        ].filter(isNonEmptyString),
      });
    }
  }

  return commands;
}

export function applyGalleryCommandAction(
  gallerySetting: GallerySetting,
  action: CommandAction,
): GallerySetting {
  switch (action.type) {
    case "toggle-tag": {
      return {
        ...gallerySetting,
        selectedTags: toggleValue(gallerySetting.selectedTags, action.tag),
      };
    }
    case "toggle-camera": {
      return {
        ...gallerySetting,
        selectedCameras: toggleValue(
          gallerySetting.selectedCameras,
          action.camera,
        ),
      };
    }
    case "toggle-lens": {
      return {
        ...gallerySetting,
        selectedLenses: toggleValue(gallerySetting.selectedLenses, action.lens),
      };
    }
    case "toggle-geo": {
      return {
        ...gallerySetting,
        [action.field]: toggleValue(gallerySetting[action.field], action.id),
      };
    }
    case "clear-filters": {
      return clearFilters(gallerySetting);
    }
    case "open-photo": {
      return gallerySetting;
    }
  }
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) {
    return [];
  }

  return commands
    .filter((command) => {
      const searchText = `${command.title} ${command.subtitle || ""} ${command.keywords?.join(" ") || ""}`;
      return fuzzyMatch(searchText, query);
    })
    .slice(0, 20);
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function clearFilters(gallerySetting: GallerySetting): GallerySetting {
  return {
    ...gallerySetting,
    selectedTags: [],
    selectedCameras: [],
    selectedLenses: [],
    selectedGeoCountries: [],
    selectedGeoRegions: [],
    selectedGeoCities: [],
    selectedGeoDistricts: [],
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function buildGeoChips(input: {
  ids: string[];
  labelMap: Map<string, string>;
  prefix: string;
  icon: string;
  field: keyof GeoFilterState;
}): ActiveFilterChip[] {
  const { ids, labelMap, prefix, icon, field } = input;
  return ids.map((id) => ({
    id: `${prefix}-${id}`,
    label: labelMap.get(id) ?? id,
    icon,
    action: { type: "toggle-geo", field, id },
  }));
}

function addGeoCommands(input: {
  commands: Command[];
  t: GalleryTranslation;
  language: string;
  geoRegions: CommandGeoRegions;
  gallerySetting: GallerySetting;
}): void {
  const { commands, t, language, geoRegions, gallerySetting } = input;
  const geoCommandGroups = [
    {
      regions: geoRegions.country,
      selected: gallerySetting.selectedGeoCountries,
      label: t("action.geo.country.filter"),
      icon: "i-mingcute-world-line",
      keywords: ["country", "geo", "region", "filter"],
      action: (id: string): CommandAction => ({
        type: "toggle-geo",
        field: "selectedGeoCountries",
        id,
      }),
    },
    {
      regions: geoRegions.region,
      selected: gallerySetting.selectedGeoRegions,
      label: t("action.geo.region.filter"),
      icon: "i-mingcute-map-pin-line",
      keywords: ["region", "geo", "filter"],
      action: (id: string): CommandAction => ({
        type: "toggle-geo",
        field: "selectedGeoRegions",
        id,
      }),
    },
    {
      regions: geoRegions.city,
      selected: gallerySetting.selectedGeoCities,
      label: t("action.geo.city.filter"),
      icon: "i-mingcute-building-5-line",
      keywords: ["city", "geo", "filter"],
      action: (id: string): CommandAction => ({
        type: "toggle-geo",
        field: "selectedGeoCities",
        id,
      }),
    },
    {
      regions: geoRegions.district,
      selected: gallerySetting.selectedGeoDistricts,
      label: t("action.geo.district.filter"),
      icon: "i-mingcute-map-pin-line",
      keywords: ["district", "geo", "filter"],
      action: (id: string): CommandAction => ({
        type: "toggle-geo",
        field: "selectedGeoDistricts",
        id,
      }),
    },
  ];

  for (const group of geoCommandGroups) {
    for (const region of group.regions) {
      const title = getRegionDisplayName(region, language);
      commands.push({
        id: `geo-${region.level}-${region.id}`,
        type: "filter",
        title,
        subtitle: group.label,
        icon: group.icon,
        active: group.selected.includes(region.id),
        action: group.action(region.id),
        keywords: [
          ...group.keywords,
          title,
          region.label,
          region.adminPath.country,
          region.adminPath.region,
          region.adminPath.city,
          region.adminPath.district,
        ].filter(isNonEmptyString),
        badge: region.photoCount,
      });
    }
  }
}
