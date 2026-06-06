import type { CameraInfo, LensInfo } from "@afilmory/schema";
import type { TFunction } from "i18next";

import type { GallerySetting } from "~/atoms/app";
import {
  fuzzyMatch,
  getLocationTokens,
  searchPhotos,
} from "~/hooks/useCommandSearch";
import type { GeoFilterState } from "~/lib/geo-regions";
import { getRegionDisplayName } from "~/lib/geo-regions";
import type { GeographicRegion } from "~/types/map";
import type { PhotoManifest } from "~/types/photo";

export type CommandType = "search" | "filter" | "action" | "photo";

export interface Command {
  id: string;
  type: CommandType;
  title: string;
  subtitle?: string;
  icon: string;
  action: () => void;
  keywords?: string[];
  badge?: string | number;
  active?: boolean;
  thumbnail?: {
    src: string;
    alt: string;
  };
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  icon: string;
  onRemove: () => void;
}

type GallerySettingUpdater = (
  updater: (previous: GallerySetting) => GallerySetting,
) => void;
type GalleryTranslation = TFunction<"app">;

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
    gallerySetting.selectedGeoCities.length
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
    input.geoRegions.city.length
  );
}

export function buildActiveFilterChips(input: {
  gallerySetting: GallerySetting;
  regionLabelMaps: Record<keyof GeoFilterState, Map<string, string>>;
  setGallerySetting: GallerySettingUpdater;
}): ActiveFilterChip[] {
  const { gallerySetting, regionLabelMaps, setGallerySetting } = input;

  return [
    ...gallerySetting.selectedTags.map((tag) => ({
      id: `tag-${tag}`,
      label: tag,
      icon: "i-mingcute-tag-line",
      onRemove: () =>
        setGallerySetting((prev) => ({
          ...prev,
          selectedTags: prev.selectedTags.filter(
            (selectedTag) => selectedTag !== tag,
          ),
        })),
    })),
    ...gallerySetting.selectedCameras.map((camera) => ({
      id: `camera-${camera}`,
      label: camera,
      icon: "i-mingcute-camera-line",
      onRemove: () =>
        setGallerySetting((prev) => ({
          ...prev,
          selectedCameras: prev.selectedCameras.filter(
            (selectedCamera) => selectedCamera !== camera,
          ),
        })),
    })),
    ...gallerySetting.selectedLenses.map((lens) => ({
      id: `lens-${lens}`,
      label: lens,
      icon: "i-mingcute-camera-2-line",
      onRemove: () =>
        setGallerySetting((prev) => ({
          ...prev,
          selectedLenses: prev.selectedLenses.filter(
            (selectedLens) => selectedLens !== lens,
          ),
        })),
    })),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoCountries,
      labelMap: regionLabelMaps.selectedGeoCountries,
      prefix: "geo-country",
      icon: "i-mingcute-world-line",
      field: "selectedGeoCountries",
      setGallerySetting,
    }),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoRegions,
      labelMap: regionLabelMaps.selectedGeoRegions,
      prefix: "geo-region",
      icon: "i-mingcute-map-pin-line",
      field: "selectedGeoRegions",
      setGallerySetting,
    }),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoCities,
      labelMap: regionLabelMaps.selectedGeoCities,
      prefix: "geo-city",
      icon: "i-mingcute-building-5-line",
      field: "selectedGeoCities",
      setGallerySetting,
    }),
    ...buildGeoChips({
      ids: gallerySetting.selectedGeoDistricts,
      labelMap: regionLabelMaps.selectedGeoDistricts,
      prefix: "geo-district",
      icon: "i-mingcute-map-pin-line",
      field: "selectedGeoDistricts",
      setGallerySetting,
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
  setGallerySetting: GallerySettingUpdater;
  updateTagFilterMode: (mode: GallerySetting["tagFilterMode"]) => void;
  openPhoto: (photo: PhotoManifest) => void;
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
    setGallerySetting,
    updateTagFilterMode,
    openPhoto,
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
      action: () => {
        setGallerySetting((prev) => ({
          ...prev,
          selectedTags: isActive
            ? prev.selectedTags.filter((selectedTag) => selectedTag !== tag)
            : [...prev.selectedTags, tag],
        }));
      },
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
      action: () => {
        setGallerySetting((prev) => ({
          ...prev,
          selectedCameras: isActive
            ? prev.selectedCameras.filter((item) => item !== camera.displayName)
            : [...prev.selectedCameras, camera.displayName],
        }));
      },
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
      action: () => {
        setGallerySetting((prev) => ({
          ...prev,
          selectedLenses: isActive
            ? prev.selectedLenses.filter((item) => item !== lens.displayName)
            : [...prev.selectedLenses, lens.displayName],
        }));
      },
      keywords: ["lens", "filter", lens.displayName],
    });
  }

  addGeoCommands({
    commands,
    t,
    language,
    geoRegions,
    gallerySetting,
    setGallerySetting,
  });

  if (allTags.length > 0) {
    const isUnionMode = gallerySetting.tagFilterMode === "union";
    commands.push({
      id: "tag-filter-mode-toggle",
      type: "action",
      title: isUnionMode
        ? t("action.tag.match.any")
        : t("action.tag.match.all"),
      subtitle: t("action.tag.match.label"),
      icon: "i-mingcute-switch-line",
      badge: isUnionMode ? t("action.tag.mode.or") : t("action.tag.mode.and"),
      action: () => updateTagFilterMode(isUnionMode ? "intersection" : "union"),
      keywords: ["tag", "filter", "mode", "toggle"],
    });
  }

  if (hasFilters) {
    commands.push({
      id: "clear-filters",
      type: "action",
      title: t("action.search.clear"),
      subtitle: t("action.search.clear-filters-subtitle"),
      icon: "i-mingcute-close-line",
      action: () => clearFilters(setGallerySetting),
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
          src: photo.thumbnailUrl,
          alt: t("action.search.photo-thumbnail", {
            title: photo.title || photo.id,
          }),
        },
        action: () => openPhoto(photo),
        keywords: [
          photo.title,
          photo.description,
          ...locationTokens,
          ...(photo.tags || []),
        ].filter(Boolean) as string[],
      });
    }
  }

  return commands;
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

function clearFilters(setGallerySetting: GallerySettingUpdater): void {
  setGallerySetting((prev) => ({
    ...prev,
    selectedTags: [],
    selectedCameras: [],
    selectedLenses: [],
    selectedGeoCountries: [],
    selectedGeoRegions: [],
    selectedGeoCities: [],
    selectedGeoDistricts: [],
    tagFilterMode: "union",
  }));
}

function buildGeoChips(input: {
  ids: string[];
  labelMap: Map<string, string>;
  prefix: string;
  icon: string;
  field: keyof GeoFilterState;
  setGallerySetting: GallerySettingUpdater;
}): ActiveFilterChip[] {
  const { ids, labelMap, prefix, icon, field, setGallerySetting } = input;
  return ids.map((id) => ({
    id: `${prefix}-${id}`,
    label: labelMap.get(id) ?? id,
    icon,
    onRemove: () =>
      setGallerySetting((prev) => ({
        ...prev,
        [field]: prev[field].filter((selectedId) => selectedId !== id),
      })),
  }));
}

function addGeoCommands(input: {
  commands: Command[];
  t: GalleryTranslation;
  language: string;
  geoRegions: CommandGeoRegions;
  gallerySetting: GallerySetting;
  setGallerySetting: GallerySettingUpdater;
}): void {
  const {
    commands,
    t,
    language,
    geoRegions,
    gallerySetting,
    setGallerySetting,
  } = input;
  const geoCommandGroups = [
    {
      regions: geoRegions.country,
      selected: gallerySetting.selectedGeoCountries,
      label: t("action.geo.country.filter"),
      icon: "i-mingcute-world-line",
      keywords: ["country", "geo", "region", "filter"],
      toggle: (id: string) =>
        setGallerySetting((prev) => ({
          ...prev,
          selectedGeoCountries: prev.selectedGeoCountries.includes(id)
            ? prev.selectedGeoCountries.filter((item) => item !== id)
            : [...prev.selectedGeoCountries, id],
        })),
    },
    {
      regions: geoRegions.city,
      selected: gallerySetting.selectedGeoCities,
      label: t("action.geo.city.filter"),
      icon: "i-mingcute-building-5-line",
      keywords: ["city", "geo", "filter"],
      toggle: (id: string) =>
        setGallerySetting((prev) => ({
          ...prev,
          selectedGeoCities: prev.selectedGeoCities.includes(id)
            ? prev.selectedGeoCities.filter((item) => item !== id)
            : [...prev.selectedGeoCities, id],
        })),
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
        action: () => group.toggle(region.id),
        keywords: [
          ...group.keywords,
          title,
          region.label,
          region.adminPath.country,
          region.adminPath.region,
          region.adminPath.city,
          region.adminPath.district,
        ].filter(Boolean) as string[],
        badge: region.photoCount,
      });
    }
  }
}
