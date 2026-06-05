import { clsxm } from "@afilmory/ui";
import { useAtom } from "jotai";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { gallerySettingAtom } from "~/atoms/app";
import { photoLoader } from "~/data-runtime/photo-loader";
import {
  fuzzyMatch,
  getLocationTokens,
  searchPhotos,
} from "~/hooks/useCommandSearch";
import {
  getViewerPhotos,
  getViewerSourceMode,
  useOpenPhotoViewer,
} from "~/hooks/usePhotoViewer";
import { MageLens } from "~/icons";
import { buildGalleryFilterSearch } from "~/lib/gallery-filter-url";
import {
  createGeographicRegions,
  getRegionDisplayName,
} from "~/lib/geo-regions";
import { convertPhotosToMarkersFromEXIF } from "~/lib/map-utils";
import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";

// Command types
type CommandType = "search" | "filter" | "action" | "photo";

interface Command {
  id: string;
  type: CommandType;
  title: string;
  subtitle?: string;
  icon: string | React.ReactNode;
  action: () => void;
  keywords?: string[];
  badge?: string | number;
  active?: boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const allTags = photoLoader.getAllTags();
const allCameras = photoLoader.getAllCameras();
const allLenses = photoLoader.getAllLenses();
const allPhotos = photoLoader.getPhotos();

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const { t } = useTranslation();
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom);
  const navigate = useNavigate();
  const openViewer = useOpenPhotoViewer();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeFilterCount =
    gallerySetting.selectedTags.length +
    gallerySetting.selectedCameras.length +
    gallerySetting.selectedLenses.length +
    gallerySetting.selectedGeoCountries.length +
    gallerySetting.selectedGeoRegions.length +
    gallerySetting.selectedGeoCities.length +
    gallerySetting.selectedGeoDistricts.length;

  const hasFilters = activeFilterCount > 0;

  const updateTagFilterMode = useCallback(
    (mode: "union" | "intersection") => {
      setGallerySetting((prev) => ({
        ...prev,
        tagFilterMode: mode,
      }));
    },
    [setGallerySetting],
  );

  const handleReset = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
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
  }, [setGallerySetting]);

  const geoRegions = useMemo(() => {
    const markers = convertPhotosToMarkersFromEXIF(allPhotos);
    return {
      country: createGeographicRegions(markers, "country"),
      region: createGeographicRegions(markers, "region"),
      city: createGeographicRegions(markers, "city"),
      district: createGeographicRegions(markers, "district"),
    };
  }, []);

  const regionLabelMaps = useMemo(
    () => ({
      country: new Map(
        geoRegions.country.map((region) => [
          region.id,
          getRegionDisplayName(region),
        ]),
      ),
      region: new Map(
        geoRegions.region.map((region) => [
          region.id,
          getRegionDisplayName(region),
        ]),
      ),
      city: new Map(
        geoRegions.city.map((region) => [
          region.id,
          getRegionDisplayName(region),
        ]),
      ),
      district: new Map(
        geoRegions.district.map((region) => [
          region.id,
          getRegionDisplayName(region),
        ]),
      ),
    }),
    [geoRegions],
  );

  const activeFilterChips = useMemo(
    () => [
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
      ...gallerySetting.selectedGeoCountries.map((id) => ({
        id: `geo-country-${id}`,
        label: regionLabelMaps.country.get(id) ?? id,
        icon: "i-mingcute-world-line",
        onRemove: () =>
          setGallerySetting((prev) => ({
            ...prev,
            selectedGeoCountries: prev.selectedGeoCountries.filter(
              (selectedId) => selectedId !== id,
            ),
          })),
      })),
      ...gallerySetting.selectedGeoRegions.map((id) => ({
        id: `geo-region-${id}`,
        label: regionLabelMaps.region.get(id) ?? id,
        icon: "i-mingcute-map-line",
        onRemove: () =>
          setGallerySetting((prev) => ({
            ...prev,
            selectedGeoRegions: prev.selectedGeoRegions.filter(
              (selectedId) => selectedId !== id,
            ),
          })),
      })),
      ...gallerySetting.selectedGeoCities.map((id) => ({
        id: `geo-city-${id}`,
        label: regionLabelMaps.city.get(id) ?? id,
        icon: "i-mingcute-building-5-line",
        onRemove: () =>
          setGallerySetting((prev) => ({
            ...prev,
            selectedGeoCities: prev.selectedGeoCities.filter(
              (selectedId) => selectedId !== id,
            ),
          })),
      })),
      ...gallerySetting.selectedGeoDistricts.map((id) => ({
        id: `geo-district-${id}`,
        label: regionLabelMaps.district.get(id) ?? id,
        icon: "i-mingcute-location-line",
        onRemove: () =>
          setGallerySetting((prev) => ({
            ...prev,
            selectedGeoDistricts: prev.selectedGeoDistricts.filter(
              (selectedId) => selectedId !== id,
            ),
          })),
      })),
    ],
    [
      gallerySetting.selectedCameras,
      gallerySetting.selectedGeoCities,
      gallerySetting.selectedGeoCountries,
      gallerySetting.selectedGeoDistricts,
      gallerySetting.selectedGeoRegions,
      gallerySetting.selectedLenses,
      gallerySetting.selectedTags,
      regionLabelMaps,
      setGallerySetting,
    ],
  );

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Generate commands
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = [];

    // Filter commands - Tags
    if (allTags.length > 0) {
      allTags.forEach((tag) => {
        const isActive = gallerySetting.selectedTags.includes(tag);
        cmds.push({
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
                ? prev.selectedTags.filter((t) => t !== tag)
                : [...prev.selectedTags, tag],
            }));
          },
          keywords: ["tag", "filter", tag],
        });
      });
    }

    // Filter commands - Cameras
    if (allCameras.length > 0) {
      allCameras.forEach((camera) => {
        const isActive = gallerySetting.selectedCameras.includes(
          camera.displayName,
        );
        cmds.push({
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
                ? prev.selectedCameras.filter((c) => c !== camera.displayName)
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
      });
    }

    // Filter commands - Lenses
    if (allLenses.length > 0) {
      allLenses.forEach((lens) => {
        const isActive = gallerySetting.selectedLenses.includes(
          lens.displayName,
        );
        cmds.push({
          id: `lens-${lens.displayName}`,
          type: "filter",
          title: lens.displayName,
          subtitle: t("action.lens.filter"),
          icon: <MageLens />,
          active: isActive,
          action: () => {
            setGallerySetting((prev) => ({
              ...prev,
              selectedLenses: isActive
                ? prev.selectedLenses.filter((l) => l !== lens.displayName)
                : [...prev.selectedLenses, lens.displayName],
            }));
          },
          keywords: ["lens", "filter", lens.displayName],
        });
      });
    }

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
        regions: geoRegions.region,
        selected: gallerySetting.selectedGeoRegions,
        label: t("action.geo.region.filter"),
        icon: "i-mingcute-map-line",
        keywords: ["region", "state", "province", "geo", "filter"],
        toggle: (id: string) =>
          setGallerySetting((prev) => ({
            ...prev,
            selectedGeoRegions: prev.selectedGeoRegions.includes(id)
              ? prev.selectedGeoRegions.filter((item) => item !== id)
              : [...prev.selectedGeoRegions, id],
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
      {
        regions: geoRegions.district,
        selected: gallerySetting.selectedGeoDistricts,
        label: t("action.geo.district.filter"),
        icon: "i-mingcute-location-line",
        keywords: ["district", "county", "geo", "filter"],
        toggle: (id: string) =>
          setGallerySetting((prev) => ({
            ...prev,
            selectedGeoDistricts: prev.selectedGeoDistricts.includes(id)
              ? prev.selectedGeoDistricts.filter((item) => item !== id)
              : [...prev.selectedGeoDistricts, id],
          })),
      },
    ];

    geoCommandGroups.forEach((group) => {
      group.regions.forEach((region) => {
        const isActive = group.selected.includes(region.id);
        const title = getRegionDisplayName(region);
        cmds.push({
          id: `geo-${region.level}-${region.id}`,
          type: "filter",
          title,
          subtitle: group.label,
          icon: group.icon,
          active: isActive,
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
      });
    });

    // Tag filter mode toggle
    if (allTags.length > 0) {
      const isUnionMode = gallerySetting.tagFilterMode === "union";
      cmds.push({
        id: "tag-filter-mode-toggle",
        type: "action",
        title: isUnionMode
          ? t("action.tag.match.any")
          : t("action.tag.match.all"),
        subtitle: t("action.tag.match.label"),
        icon: "i-mingcute-switch-line",
        badge: isUnionMode ? t("action.tag.mode.or") : t("action.tag.mode.and"),
        action: () =>
          updateTagFilterMode(isUnionMode ? "intersection" : "union"),
        keywords: ["tag", "filter", "mode", "toggle"],
      });
    }

    if (hasFilters) {
      cmds.push({
        id: "clear-filters",
        type: "action",
        title: t("action.search.clear"),
        subtitle: t("action.search.clear-filters-subtitle"),
        icon: "i-mingcute-close-line",
        action: () => {
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
        },
        keywords: ["clear", "reset", "remove", "filter"],
      });
    }

    // Photo search results
    if (query.trim()) {
      const photos = searchPhotos(allPhotos, query);
      photos.slice(0, 10).forEach((photo) => {
        const locationTokens = getLocationTokens(photo.location);
        const locationSubtitle = locationTokens.join(", ");
        cmds.push({
          id: `photo-${photo.id}`,
          type: "photo",
          title: photo.title || photo.id,
          subtitle:
            photo.description ||
            locationSubtitle ||
            `${photo.exif?.Model || t("action.search.photo")}`,
          icon: (
            <img
              src={photo.thumbnailUrl}
              alt={t("action.search.photo-thumbnail", {
                title: photo.title || photo.id,
              })}
              className="h-10 w-10 rounded-xl object-cover"
            />
          ),
          action: () => {
            const viewerPhotos = getViewerPhotos(photo.id);
            const photoIndex = viewerPhotos.findIndex((p) => p.id === photo.id);
            if (photoIndex !== -1) {
              openViewer(photoIndex, {
                sourceMode: getViewerSourceMode(photo.id),
                sourcePhotoIds: viewerPhotos.map(
                  (viewerPhoto) => viewerPhoto.id,
                ),
              });
              navigate({
                pathname: buildPhotoDetailPathname(photo.id),
                search: buildGalleryFilterSearch("", gallerySetting),
              });
              onClose();
            }
          },
          keywords: [
            photo.title,
            photo.description,
            ...locationTokens,
            ...(photo.tags || []),
          ].filter(Boolean) as string[],
        });
      });
    }

    return cmds;
  }, [
    t,
    gallerySetting,
    geoRegions,
    query,
    navigate,
    onClose,
    setGallerySetting,
    openViewer,
    updateTagFilterMode,
    hasFilters,
  ]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show all filters when no query - group by type
      const activeFilters = commands.filter((cmd) => cmd.active);
      const allFilters = commands.filter((cmd) => cmd.type === "filter");

      // Prioritize active filters, then show all available filters
      const uniqueFilters = new Map<string, Command>();

      // First add active filters
      activeFilters.forEach((cmd) => uniqueFilters.set(cmd.id, cmd));

      // Then add remaining filters
      allFilters.forEach((cmd) => {
        if (!uniqueFilters.has(cmd.id)) {
          uniqueFilters.set(cmd.id, cmd);
        }
      });

      return Array.from(uniqueFilters.values()).slice(0, 30);
    }

    return commands
      .filter((cmd) => {
        const searchText = `${cmd.title} ${cmd.subtitle || ""} ${cmd.keywords?.join(" ") || ""}`;
        return fuzzyMatch(searchText, query);
      })
      .slice(0, 20);
  }, [commands, query]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredCommands.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredCommands.length - 1),
          );
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        }
      }
    },
    [filteredCommands, selectedIndex],
  );

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.children[
      selectedIndex
    ] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  if (!isOpen) return null;

  const resultSummary = query.trim()
    ? t("action.search.command-count", { count: filteredCommands.length })
    : t("action.search.showing-filters", { count: filteredCommands.length });

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center lg:items-start lg:pt-[12vh]"
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xl transition-all duration-200" />

      {/* Command Palette Panel */}
      <div
        className="animate-in fade-in slide-in-from-bottom-4 bg-material-thick border-fill-tertiary lg:slide-in-from-top-4 relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl rounded-b-none border shadow-xl backdrop-blur-2xl duration-200 lg:max-h-[72vh] lg:rounded-2xl!"
        style={{
          boxShadow:
            "0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner glow layer */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))",
          }}
        />
        {/* Search Input */}
        <div className="border-fill-secondary relative border-b px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="bg-accent/10 ring-accent/20 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset">
              <i className="i-mingcute-search-line text-accent text-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-text text-base leading-tight font-semibold tracking-tight">
                {t("action.search.unified.title")}
              </h2>
              <p className="text-text-secondary mt-1 text-xs">
                {t("action.search.indexed-photos", { count: allPhotos.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="glassmorphic-btn border-fill-tertiary text-text-secondary hover:text-accent focus-visible:ring-accent/45 flex size-10 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-inset"
              aria-label={t("action.search.reset")}
              title={t("action.search.reset")}
            >
              <i className="i-mingcute-refresh-1-line text-base" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="glassmorphic-btn border-fill-tertiary text-text-secondary hover:text-accent focus-visible:ring-accent/45 flex size-10 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-inset"
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <i className="i-mingcute-close-line text-base" />
            </button>
          </div>

          <div className="bg-fill-vibrant-quinary border-fill-tertiary focus-within:border-accent/50 focus-within:bg-fill-secondary/70 focus-within:ring-accent/20 flex h-12 items-center gap-3 rounded-xl border px-3 transition-[background-color,border-color,box-shadow] duration-200 focus-within:ring-2">
            <i className="i-mingcute-search-line text-text-tertiary shrink-0 text-lg" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("action.search.placeholder")}
              aria-label={t("action.search.placeholder")}
              className="text-text placeholder-text-tertiary h-full min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="border-fill-secondary relative border-b px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-text-secondary flex items-center gap-2 text-xs font-medium">
                <i className="i-mingcute-filter-3-line text-sm" />
                <span>
                  {t("action.search.active-filters", {
                    count: activeFilterCount,
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-text-secondary hover:text-accent focus-visible:ring-accent/35 rounded-full px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2"
              >
                {t("action.search.clear")}
              </button>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={chip.onRemove}
                  className="bg-accent/10 text-accent ring-accent/20 hover:bg-accent/15 focus-visible:ring-accent/45 flex max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors ring-inset focus-visible:ring-2"
                  aria-label={`${t("action.search.clear")} ${chip.label}`}
                  title={chip.label}
                >
                  <i className={clsxm(chip.icon, "shrink-0 text-sm")} />
                  <span className="truncate">{chip.label}</span>
                  <i className="i-mingcute-close-line shrink-0 text-sm" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-fill-secondary bg-fill-vibrant-quinary/60 text-text-secondary relative flex items-center justify-between gap-3 border-b px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <i className="i-mingcute-filter-3-line text-sm" />
            <span>{t("action.tag.match.label")}</span>
          </div>
          <div className="bg-fill-secondary/70 border-fill-tertiary flex rounded-full border p-0.5">
            <button
              type="button"
              onClick={() => updateTagFilterMode("union")}
              className={clsxm(
                "focus-visible:ring-accent/45 rounded-full px-3 py-1 text-xs font-medium transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
                gallerySetting.tagFilterMode === "union"
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:text-text",
              )}
              aria-pressed={gallerySetting.tagFilterMode === "union"}
            >
              {t("action.tag.match.any")}
            </button>
            <button
              type="button"
              onClick={() => updateTagFilterMode("intersection")}
              className={clsxm(
                "focus-visible:ring-accent/45 rounded-full px-3 py-1 text-xs font-medium transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
                gallerySetting.tagFilterMode === "intersection"
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:text-text",
              )}
              aria-pressed={gallerySetting.tagFilterMode === "intersection"}
            >
              {t("action.tag.match.all")}
            </button>
          </div>
        </div>

        {/* Commands List */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
        >
          {filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <i className="i-mingcute-search-line text-text-quaternary mb-3 text-4xl" />
              <p className="text-text-secondary text-sm">
                {t("action.search.no-results")}
              </p>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(index)}
                className={clsxm(
                  "command-item focus-visible:ring-accent/35 group flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
                  selectedIndex === index && "selected",
                )}
              >
                {/* Icon */}
                <div
                  className={clsxm(
                    "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg transition-all duration-200",
                    cmd.active
                      ? "bg-accent/10 text-accent"
                      : "bg-fill-vibrant-quinary text-text-secondary",
                  )}
                  style={
                    cmd.active
                      ? {
                          boxShadow:
                            "inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 20%, transparent)",
                        }
                      : undefined
                  }
                >
                  {typeof cmd.icon === "string" ? (
                    <i className={cmd.icon} />
                  ) : (
                    cmd.icon
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-text min-w-0 truncate text-sm font-medium">
                      {cmd.title}
                    </span>
                    {cmd.badge !== undefined && (
                      <span className="bg-fill-tertiary text-text-secondary rounded-full px-2 py-0.5 text-xs">
                        {cmd.badge}
                      </span>
                    )}
                    {cmd.active && (
                      <span className="bg-accent flex h-5 w-5 items-center justify-center rounded-full text-white">
                        <i className="i-mingcute-check-line text-xs" />
                      </span>
                    )}
                  </div>
                  {cmd.subtitle && (
                    <p className="text-text-secondary truncate text-xs">
                      {cmd.subtitle}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-fill-secondary bg-fill-vibrant-quinary/40 relative border-t px-4 py-3">
          <div className="text-text-secondary flex items-center justify-between text-xs">
            <span>{resultSummary}</span>
            {hasFilters && (
              <span>
                {t("action.search.active-count", { count: activeFilterCount })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
