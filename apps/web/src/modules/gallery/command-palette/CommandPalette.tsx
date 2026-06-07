import { clsxm } from "@afilmory/ui";
import { useAtom } from "jotai";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { gallerySettingAtom } from "~/atoms/app";
import { ThumbnailImage } from "~/components/ui/ThumbnailImage";
import {
  getViewerPhotos,
  getViewerSourceMode,
  useOpenPhotoViewer,
} from "~/hooks/usePhotoViewer";
import { buildGalleryFilterSearch } from "~/lib/gallery-filter-url";
import { translateDynamicKey } from "~/lib/i18n-dynamic";
import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";
import { FilterPanelContent } from "~/modules/gallery/panels/FilterPanel";
import { useAfilmoryRuntime, usePhotoRepository } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

import {
  createGalleryGeoRegions,
  createGeoRegionLabelMaps,
} from "../filter-options";
import { resolveCommandKeyboardIntent } from "./keyboard";
import type { CommandAction } from "./model";
import {
  applyGalleryCommandAction,
  buildActiveFilterChips,
  buildCommandIndex,
  filterCommands,
  getActiveFilterCount,
  getAvailableFilterCount,
} from "./model";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const DISMISS_DRAG_THRESHOLD = 72;
type PanelDragInput = "pointer" | "mouse" | "touch";

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const { t, i18n } = useTranslation();
  const commandT = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      translateDynamicKey(i18n, key, options),
    [i18n],
  );
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
  const [panelDragOffset, setPanelDragOffset] = useState(0);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragInputRef = useRef<PanelDragInput | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragTouchIdRef = useRef<number | null>(null);
  const cleanupDragListenersRef = useRef<(() => void) | null>(null);
  const panelDragOffsetRef = useRef(0);

  const activeFilterCount = getActiveFilterCount(gallerySetting);

  const hasFilters = activeFilterCount > 0;

  const handleReset = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setGallerySetting((prev) =>
      applyGalleryCommandAction(prev, { type: "clear-filters" }),
    );
  }, [setGallerySetting]);

  const setPanelDrag = useCallback((offset: number) => {
    panelDragOffsetRef.current = offset;
    setPanelDragOffset(offset);
  }, []);

  const cleanupDragListeners = useCallback(() => {
    cleanupDragListenersRef.current?.();
    cleanupDragListenersRef.current = null;
  }, []);

  const resetPanelDrag = useCallback(() => {
    cleanupDragListeners();
    dragStartYRef.current = null;
    dragInputRef.current = null;
    dragPointerIdRef.current = null;
    dragTouchIdRef.current = null;
    setIsDraggingPanel(false);
    setPanelDrag(0);
  }, [cleanupDragListeners, setPanelDrag]);

  const startPanelDrag = useCallback(
    (input: PanelDragInput, clientY: number) => {
      if (dragInputRef.current !== null) {
        return false;
      }

      dragInputRef.current = input;
      dragStartYRef.current = clientY;
      setIsDraggingPanel(true);
      setPanelDrag(0);
      return true;
    },
    [setPanelDrag],
  );

  const updatePanelDrag = useCallback(
    (clientY: number) => {
      if (dragStartYRef.current === null) {
        return 0;
      }

      const nextOffset = Math.max(0, clientY - dragStartYRef.current);
      setPanelDrag(nextOffset);
      return nextOffset;
    },
    [setPanelDrag],
  );

  const finishPanelDrag = useCallback(() => {
    if (panelDragOffsetRef.current >= DISMISS_DRAG_THRESHOLD) {
      resetPanelDrag();
      onClose();
      return;
    }

    resetPanelDrag();
  }, [onClose, resetPanelDrag]);

  const handleDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.pointerType === "mouse") {
        return;
      }

      if (!startPanelDrag("pointer", event.clientY)) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragPointerIdRef.current = event.pointerId;
    },
    [startPanelDrag],
  );

  const handleDragHandlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        dragInputRef.current !== "pointer" ||
        dragPointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      const nextOffset = updatePanelDrag(event.clientY);
      if (nextOffset > 0) {
        event.preventDefault();
      }
    },
    [updatePanelDrag],
  );

  const handleDragHandlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        dragInputRef.current !== "pointer" ||
        dragPointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      finishPanelDrag();
    },
    [finishPanelDrag],
  );

  const handleDragHandlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        dragInputRef.current === "pointer" &&
        dragPointerIdRef.current === event.pointerId
      ) {
        resetPanelDrag();
      }
    },
    [resetPanelDrag],
  );

  const handleDragHandleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !startPanelDrag("mouse", event.clientY)) {
        return;
      }

      event.preventDefault();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextOffset = updatePanelDrag(moveEvent.clientY);
        if (nextOffset > 0) {
          moveEvent.preventDefault();
        }
      };
      const handleMouseUp = () => finishPanelDrag();

      cleanupDragListeners();
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      cleanupDragListenersRef.current = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    },
    [cleanupDragListeners, finishPanelDrag, startPanelDrag, updatePanelDrag],
  );

  const handleDragHandleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      if (!touch || !startPanelDrag("touch", touch.clientY)) {
        return;
      }

      event.preventDefault();
      dragTouchIdRef.current = touch.identifier;

      const findTrackedTouch = (touches: TouchList) => {
        for (const touchItem of touches) {
          if (touchItem.identifier === dragTouchIdRef.current) {
            return touchItem;
          }
        }

        return null;
      };

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const trackedTouch = findTrackedTouch(moveEvent.changedTouches);
        if (!trackedTouch) {
          return;
        }

        const nextOffset = updatePanelDrag(trackedTouch.clientY);
        if (nextOffset > 0) {
          moveEvent.preventDefault();
        }
      };
      const handleTouchEnd = (endEvent: TouchEvent) => {
        if (findTrackedTouch(endEvent.changedTouches)) {
          finishPanelDrag();
        }
      };

      cleanupDragListeners();
      window.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      window.addEventListener("touchend", handleTouchEnd);
      window.addEventListener("touchcancel", handleTouchEnd);
      cleanupDragListenersRef.current = () => {
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
        window.removeEventListener("touchcancel", handleTouchEnd);
      };
    },
    [cleanupDragListeners, finishPanelDrag, startPanelDrag, updatePanelDrag],
  );

  useEffect(() => cleanupDragListeners, [cleanupDragListeners]);

  const geoRegions = useMemo(
    () => createGalleryGeoRegions(allPhotos),
    [allPhotos],
  );

  const regionLabelMaps = useMemo(
    () => createGeoRegionLabelMaps(geoRegions, i18n.language),
    [geoRegions, i18n.language],
  );

  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips({
        gallerySetting,
        regionLabelMaps,
      }),
    [gallerySetting, regionLabelMaps],
  );

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      resetPanelDrag();
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, resetPanelDrag]);

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

  const executeCommandAction = useCallback(
    (action: CommandAction) => {
      if (action.type === "open-photo") {
        const photo = allPhotos.find((item) => item.id === action.photoId);
        if (photo) {
          openPhoto(photo);
        }
        return;
      }

      setGallerySetting((prev) => applyGalleryCommandAction(prev, action));
    },
    [allPhotos, openPhoto, setGallerySetting],
  );

  const commands = useMemo(
    () =>
      buildCommandIndex({
        t: commandT,
        language: i18n.language,
        gallerySetting,
        allTags,
        allCameras,
        allLenses,
        allPhotos,
        geoRegions,
        query,
        hasFilters,
      }),
    [
      commandT,
      i18n.language,
      gallerySetting,
      allTags,
      allCameras,
      allLenses,
      allPhotos,
      geoRegions,
      query,
      hasFilters,
    ],
  );

  const filteredCommands = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const intent = resolveCommandKeyboardIntent(e.key, {
        selectedIndex,
        resultCount: filteredCommands.length,
      });

      if (intent.type === "none") {
        return;
      }

      e.preventDefault();
      if (intent.type === "move") {
        setSelectedIndex(intent.selectedIndex);
        return;
      }

      const command = filteredCommands[intent.selectedIndex];
      if (command) {
        executeCommandAction(command.action);
      }
    },
    [executeCommandAction, filteredCommands, selectedIndex],
  );

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.children[selectedIndex];
    if (selectedElement instanceof HTMLElement) {
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
          transform: `translateY(${panelDragOffset}px)`,
          transition: isDraggingPanel ? "none" : "transform 180ms ease-out",
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
        <div
          className="flex h-10 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={handleDragHandlePointerDown}
          onPointerMove={handleDragHandlePointerMove}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerCancel}
          onMouseDown={handleDragHandleMouseDown}
          onTouchStart={handleDragHandleTouchStart}
        >
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
                  onClick={() => executeCommandAction(chip.action)}
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
                onClick={() => executeCommandAction(cmd.action)}
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
                    <ThumbnailImage
                      photoId={cmd.thumbnail.photoId}
                      src={cmd.thumbnail.src}
                      alt={cmd.thumbnail.alt}
                      thumbHash={cmd.thumbnail.thumbHash}
                      containerClassName="h-10 w-10 rounded-xl"
                      imageClassName="h-full w-full rounded-xl object-cover"
                      fetchPriority="low"
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
        <div className="border-fill-secondary bg-fill-vibrant-quinary/40 relative border-t px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4">
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
