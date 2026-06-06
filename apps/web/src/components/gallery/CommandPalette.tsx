import { clsxm } from "@afilmory/ui";
import { useAtom } from "jotai";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { gallerySettingAtom } from "~/atoms/app";
import {
  getViewerPhotos,
  getViewerSourceMode,
  useOpenPhotoViewer,
} from "~/hooks/usePhotoViewer";
import { buildGalleryFilterSearch } from "~/lib/gallery-filter-url";
import {
  createGeographicRegions,
  getRegionDisplayName,
} from "~/lib/geo-regions";
import { convertPhotosToMarkersFromEXIF } from "~/lib/map-utils";
import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";
import { FilterPanelContent } from "~/modules/gallery/panels/FilterPanel";
import { useAfilmoryRuntime, usePhotoRepository } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

import {
  buildActiveFilterChips,
  buildCommandIndex,
  filterCommands,
  getActiveFilterCount,
  getAvailableFilterCount,
} from "./command-palette-model";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const { t, i18n } = useTranslation();
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom);
  const navigate = useNavigate();
  const openViewer = useOpenPhotoViewer();
  const runtime = useAfilmoryRuntime();
  const photoRepository = usePhotoRepository();
  const allTags = useMemo(
    () => photoRepository.getAllTags(),
    [photoRepository],
  );
  const allCameras = useMemo(
    () => photoRepository.getAllCameras(),
    [photoRepository],
  );
  const allLenses = useMemo(
    () => photoRepository.getAllLenses(),
    [photoRepository],
  );
  const allPhotos = photoRepository.getPhotos();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = getActiveFilterCount(gallerySetting);

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
  }, [allPhotos]);

  const regionLabelMaps = useMemo(
    () => ({
      selectedGeoCountries: new Map(
        geoRegions.country.map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
      selectedGeoRegions: new Map(
        geoRegions.region.map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
      selectedGeoCities: new Map(
        geoRegions.city.map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
      selectedGeoDistricts: new Map(
        geoRegions.district.map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
    }),
    [geoRegions, i18n.language],
  );

  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips({
        gallerySetting,
        regionLabelMaps,
        setGallerySetting,
      }),
    [gallerySetting, regionLabelMaps, setGallerySetting],
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

  const openPhoto = useCallback(
    (photo: PhotoManifest) => {
      const viewerPhotos = getViewerPhotos(runtime, photo.id);
      const photoIndex = viewerPhotos.findIndex((item) => item.id === photo.id);
      if (photoIndex === -1) {
        return;
      }

      openViewer(photoIndex, {
        sourceMode: getViewerSourceMode(runtime, photo.id),
        sourcePhotoIds: viewerPhotos.map((viewerPhoto) => viewerPhoto.id),
      });
      navigate({
        pathname: buildPhotoDetailPathname(photo.id),
        search: buildGalleryFilterSearch("", gallerySetting),
      });
      onClose();
    },
    [gallerySetting, navigate, onClose, openViewer, runtime],
  );

  const commands = useMemo(
    () =>
      buildCommandIndex({
        t,
        language: i18n.language,
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
      }),
    [
      t,
      i18n.language,
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
    ],
  );

  const filteredCommands = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

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

  const isBrowsingFilters = !query.trim();
  const availableFilterCount = getAvailableFilterCount({
    allTags,
    allCameras,
    allLenses,
    geoRegions,
  });
  const resultSummary = query.trim()
    ? t("action.search.command-count", { count: filteredCommands.length })
    : t("action.search.showing-filters", { count: availableFilterCount });

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xl transition-[background-color,backdrop-filter] duration-200" />

      {/* Command Palette Panel */}
      <div
        className="animate-in fade-in slide-in-from-bottom-4 bg-material-thick border-fill-tertiary relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.75rem] border-x border-t shadow-2xl backdrop-blur-2xl duration-200 lg:mb-6 lg:max-h-[min(86vh,46rem)] lg:rounded-[1.75rem] lg:border"
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
        <div className="flex h-10 shrink-0 items-center justify-center">
          <div className="bg-fill-tertiary h-1.5 w-12 rounded-full" />
        </div>
        {/* Search Input */}
        <div className="border-fill-secondary relative border-b px-6 pb-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="bg-accent/10 border-accent/20 text-accent flex size-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm">
              <i className="i-mingcute-search-line text-accent text-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-text text-lg leading-tight font-semibold text-pretty">
                {t("action.search.unified.title")}
              </h2>
              <p className="text-text-secondary mt-1 text-sm">
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

          <div className="bg-fill-vibrant-quinary border-fill-tertiary focus-within:border-accent/50 focus-within:bg-fill-secondary/70 focus-within:ring-accent/20 flex h-12 items-center gap-3 rounded-2xl border px-3 shadow-inner transition-[background-color,border-color,box-shadow] duration-200 focus-within:ring-2">
            <i className="i-mingcute-search-line text-text-tertiary shrink-0 text-lg" />
            <input
              ref={inputRef}
              type="text"
              name="gallery-search"
              autoComplete="off"
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
          <div className="border-fill-secondary relative border-b px-6 py-3">
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

        <div className="border-fill-secondary bg-fill-vibrant-quinary/35 text-text-secondary relative flex items-center justify-between gap-3 border-b px-6 py-4 text-sm">
          <div className="flex items-center gap-2">
            <i className="i-mingcute-filter-3-line text-sm" />
            <span>{t("action.tag.match.label")}</span>
          </div>
          <div className="bg-fill-secondary/70 border-fill-tertiary flex shrink-0 rounded-full border p-0.5">
            <button
              type="button"
              onClick={() => updateTagFilterMode("union")}
              className={clsxm(
                "focus-visible:ring-accent/45 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
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
                "focus-visible:ring-accent/45 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
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
          {isBrowsingFilters ? (
            <FilterPanelContent
              showHeader={false}
              className="max-h-none overflow-visible px-6 pt-3 pb-8"
            />
          ) : filteredCommands.length === 0 ? (
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
                  "command-item focus-visible:ring-accent/35 group flex w-full items-center gap-3 px-6 py-3 text-left transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
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
                  {cmd.thumbnail ? (
                    <img
                      src={cmd.thumbnail.src}
                      alt={cmd.thumbnail.alt}
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                  ) : (
                    <i className={cmd.icon} />
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
        <div className="pb-safe border-fill-secondary bg-fill-vibrant-quinary/40 relative border-t px-6 pt-3 pb-4">
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
