import "../Gallery.css";

import { clsxm } from "@afilmory/ui";
import { useReducedMotion } from "motion/react";
import * as React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";
import { useDialogFocusManagement } from "~/hooks/useDialogFocusManagement";
import { useMobile } from "~/hooks/useMobile";
import { useModalIsolation } from "~/hooks/useModalIsolation";
import { usePanelDragDismiss } from "~/hooks/usePanelDragDismiss";
import { getViewerPhotos } from "~/hooks/usePhotoViewer";
import { translateDynamicKey } from "~/lib/i18n-dynamic";
import { FilterPanel } from "~/modules/gallery/panels/FilterPanel";
import { useAppNavigation, useGallerySettings } from "~/navigation/hooks";
import {
  useAfilmoryRuntime,
  usePhotoRepository,
  usePhotoRepositorySnapshot,
} from "~/runtime/app-runtime";
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
  buildPhotoCommands,
  filterCommands,
  getActiveFilterCount,
  getAvailableFilterCount,
} from "./model";
import { buildPhotoSearchIndex, searchPhotoIndex } from "./search";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const DISMISS_DRAG_THRESHOLD = 72;

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const { t, i18n } = useTranslation();
  const commandT = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      translateDynamicKey(i18n, key, options),
    [i18n],
  );
  const [gallerySetting, setGallerySetting] = useGallerySettings();
  const navigation = useAppNavigation();
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
  const allPhotos = usePhotoRepositorySnapshot();
  const photoById = useMemo(
    () => new Map(allPhotos.map((photo) => [photo.id, photo])),
    [allPhotos],
  );
  const photoSearchIndex = useMemo(
    () => buildPhotoSearchIndex(allPhotos),
    [allPhotos],
  );

  const [query, setQuery] = useState("");
  const deferredQuery = React.useDeferredValue(query);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion() === true;
  const isMobile = useMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useModalIsolation(isOpen);
  useDialogFocusManagement({
    dialogRef: panelRef,
    focusContainerOnOpen: isMobile,
    initialFocusSelector: '[name="gallery-search"]',
    isOpen,
  });

  // combobox/listbox 语义要求 aria-activedescendant 引用合法且页面唯一的 DOM id。
  // 命令 id 可能含空格（相机名、标签），encodeURIComponent 保证合法且不撞车。
  const baseDomId = useId();
  const listboxDomId = `${baseDomId}-listbox`;
  const getOptionDomId = useCallback(
    (commandId: string) =>
      `${baseDomId}-option-${encodeURIComponent(commandId)}`,
    [baseDomId],
  );

  // 下拉关闭手势（鼠标 / 触摸 / 触控笔统一 Pointer Events 一套）
  const {
    offset: panelDragOffset,
    isDragging: isDraggingPanel,
    handleRef: dragHandleRef,
  } = usePanelDragDismiss({
    enabled: isOpen,
    onDismiss: onClose,
    threshold: DISMISS_DRAG_THRESHOLD,
  });

  const activeFilterCount = getActiveFilterCount(gallerySetting);

  const hasFilters = activeFilterCount > 0;

  const handleReset = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setGallerySetting((prev) =>
      applyGalleryCommandAction(prev, { type: "clear-filters" }),
    );
  }, [setGallerySetting]);

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

  // Reset state when opened (drag offset resets inside usePanelDragDismiss via `enabled`).
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
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

      navigation.openPhoto(photo.id, {
        photoIds: viewerPhotos.map((photo) => photo.id),
      });
      onClose();
    },
    [navigation, onClose, runtime],
  );

  const executeCommandAction = useCallback(
    (action: CommandAction) => {
      if (action.type === "open-photo") {
        const photo = photoById.get(action.photoId);
        if (photo) {
          openPhoto(photo);
        }
        return;
      }

      setGallerySetting((prev) => applyGalleryCommandAction(prev, action));
    },
    [openPhoto, photoById, setGallerySetting],
  );

  const baseCommands = useMemo(
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
        query: "",
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
      hasFilters,
    ],
  );

  const photoCommands = useMemo(
    () =>
      buildPhotoCommands({
        t: commandT,
        photos: searchPhotoIndex(photoSearchIndex, deferredQuery, 10),
      }),
    [commandT, deferredQuery, photoSearchIndex],
  );
  const commands = useMemo(
    () => [...baseCommands, ...photoCommands],
    [baseCommands, photoCommands],
  );

  const filteredCommands = useMemo(
    () => filterCommands(commands, deferredQuery),
    [commands, deferredQuery],
  );
  const isBrowsingFilters = !query.trim();
  const visibleCommands = useMemo(
    () =>
      !isBrowsingFilters && query === deferredQuery ? filteredCommands : [],
    [deferredQuery, filteredCommands, isBrowsingFilters, query],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const intent = resolveCommandKeyboardIntent(e.key, {
        selectedIndex,
        resultCount: visibleCommands.length,
      });

      if (intent.type === "none") {
        return;
      }

      e.preventDefault();
      if (intent.type === "move") {
        setSelectedIndex(intent.selectedIndex);
        return;
      }

      const command = visibleCommands[intent.selectedIndex];
      if (command) {
        executeCommandAction(command.action);
      }
    },
    [executeCommandAction, selectedIndex, visibleCommands],
  );

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.children[selectedIndex];
    if (selectedElement instanceof HTMLElement) {
      selectedElement.scrollIntoView({
        block: "nearest",
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    }
  }, [selectedIndex, shouldReduceMotion]);

  // Stable signature of the filtered result set (ids + order). Filtering often
  // changes the contents while keeping the same length, so resetting on length
  // alone leaves the highlight pointing at a different command than shown —
  // pressing Enter would then run the wrong command.
  const filteredCommandsKey = useMemo(
    () => visibleCommands.map((command) => command.id).join("\u0000"),
    [visibleCommands],
  );

  // Reset selected index whenever the filtered command set changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommandsKey]);

  if (!isOpen) return null;

  const availableFilterCount = getAvailableFilterCount({
    allTags,
    allCameras,
    allLenses,
    geoRegions,
  });
  const resultSummary = query.trim()
    ? t("action.search.command-count", { count: visibleCommands.length })
    : t("action.search.showing-filters", { count: availableFilterCount });

  // 读屏器可见性：只有真正渲染选项列表时 combobox 才算 expanded，
  // aria-activedescendant 跟着高亮项走，箭头键选中什么用户就听到什么。
  const isListboxVisible = !isBrowsingFilters && visibleCommands.length > 0;
  const selectedCommand = visibleCommands[selectedIndex];
  const activeOptionDomId =
    isListboxVisible && selectedCommand
      ? getOptionDomId(selectedCommand.id)
      : undefined;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      {/* Backdrop with blur */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 bg-black/30 backdrop-blur-xl transition-[background-color,backdrop-filter] duration-200"
        onClick={onClose}
      />

      {/* Command Palette Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("action.search.unified.title")}
        tabIndex={-1}
        className="af-popover animate-in fade-in slide-in-from-bottom-4 relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden overscroll-contain rounded-t-[1.75rem] duration-200 outline-none lg:mb-6 lg:max-h-[min(86vh,46rem)] lg:rounded-[1.75rem]"
        style={{
          transform: `translateY(${panelDragOffset}px)`,
          transition: isDraggingPanel ? "none" : "transform 180ms ease-out",
        }}
      >
        <div
          ref={dragHandleRef}
          className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <div className="bg-ui-hover h-1.5 w-12 rounded-full" />
        </div>
        {/* Search Input */}
        <div className="border-ui-border relative border-b px-6 pb-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="af-panel text-ui-secondary flex size-12 shrink-0 items-center justify-center rounded-2xl">
              <i
                className="i-mingcute-search-line text-lg"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-ui text-lg leading-tight font-semibold text-pretty">
                {t("action.search.unified.title")}
              </h2>
              <p className="text-ui-secondary mt-1 text-sm">
                {t("action.search.indexed-photos", { count: allPhotos.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="af-control flex size-11 shrink-0 items-center justify-center rounded-xl"
              aria-label={t("action.search.reset")}
              title={t("action.search.reset")}
            >
              <i
                className="i-mingcute-refresh-1-line text-base"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="af-control flex size-11 shrink-0 items-center justify-center rounded-xl"
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <i
                className="i-mingcute-close-line text-base"
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="af-input-shell flex h-12 items-center gap-3 rounded-2xl px-3">
            <i
              className="i-mingcute-search-line text-ui-muted shrink-0 text-lg"
              aria-hidden="true"
            />
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
              role="combobox"
              aria-expanded={isListboxVisible}
              aria-controls={isListboxVisible ? listboxDomId : undefined}
              aria-activedescendant={activeOptionDomId}
              aria-autocomplete="list"
              className="text-ui placeholder:text-ui-muted h-full min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="border-ui-border relative border-b px-6 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-ui-secondary flex items-center gap-2 text-xs font-medium">
                <i
                  className="i-mingcute-filter-3-line text-sm"
                  aria-hidden="true"
                />
                <span>
                  {t("action.search.active-filters", {
                    count: activeFilterCount,
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="af-control min-h-11 shrink-0 rounded-xl px-3 text-xs font-medium"
              >
                {t("action.search.clear")}
              </button>
            </div>
            <div className="-mx-1 flex items-start gap-2 overflow-x-auto px-1 pb-1">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => executeCommandAction(chip.action)}
                  className="af-control flex min-h-11 max-w-[min(20rem,100%)] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] leading-5 font-medium [--af-focus-offset:-2px]"
                  aria-label={`${t("action.search.clear")} ${chip.label}`}
                >
                  <i
                    className={clsxm(chip.icon, "shrink-0 text-sm")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere] whitespace-normal">
                    {chip.label}
                  </span>
                  <i
                    className="i-mingcute-close-line shrink-0 text-sm"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Commands List */}
        <div
          ref={listRef}
          id={isListboxVisible ? listboxDomId : undefined}
          role={isListboxVisible ? "listbox" : undefined}
          aria-label={
            isListboxVisible ? t("action.search.unified.title") : undefined
          }
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
        >
          {isBrowsingFilters ? (
            <FilterPanel
              showHeader={false}
              className="max-h-none overflow-visible px-6 pt-3 pb-8"
            />
          ) : visibleCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <i
                className="i-mingcute-search-line text-ui-muted mb-3 text-4xl"
                aria-hidden="true"
              />
              <p className="text-ui-secondary text-sm">
                {t("action.search.no-results")}
              </p>
              <button
                type="button"
                className="af-control mt-4 min-h-11 rounded-xl px-4 text-sm font-medium"
                onClick={() => {
                  setQuery("");
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                {t("action.search.clear-query")}
              </button>
            </div>
          ) : (
            visibleCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                id={getOptionDomId(cmd.id)}
                role="option"
                aria-selected={selectedIndex === index}
                aria-description={
                  cmd.active ? t("action.search.filter-applied") : undefined
                }
                onClick={() => executeCommandAction(cmd.action)}
                onMouseEnter={() => setSelectedIndex(index)}
                className="af-command-option group flex min-h-16 w-full items-start gap-3 px-6 py-3 text-left transition-[background-color,box-shadow,color] duration-200 [--af-focus-offset:-2px]"
              >
                {/* Icon */}
                <div className="af-panel text-ui-secondary flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg">
                  {cmd.thumbnail ? (
                    <ThumbnailImage
                      photoId={cmd.thumbnail.photoId}
                      src={cmd.thumbnail.src}
                      alt={cmd.thumbnail.alt}
                      width={cmd.thumbnail.width}
                      height={cmd.thumbnail.height}
                      thumbHash={cmd.thumbnail.thumbHash}
                      containerClassName="h-10 w-10 rounded-xl"
                      imageClassName="h-full w-full rounded-xl object-cover"
                      fetchPriority="low"
                    />
                  ) : (
                    <i className={cmd.icon} aria-hidden="true" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="text-ui min-w-0 flex-1 text-sm leading-5 font-medium [overflow-wrap:anywhere] whitespace-normal">
                      {cmd.title}
                    </span>
                    {cmd.badge !== undefined && (
                      <span className="af-panel text-ui-secondary shrink-0 rounded-md px-2 py-0.5 text-xs tabular-nums">
                        {cmd.badge}
                      </span>
                    )}
                    {cmd.active && (
                      <span
                        className="bg-accent text-accent-content flex size-5 shrink-0 items-center justify-center rounded-full"
                        aria-hidden="true"
                      >
                        <i
                          className="i-mingcute-check-line text-xs"
                          aria-hidden="true"
                        />
                      </span>
                    )}
                  </div>
                  {cmd.type === "photo" && (
                    <span className="text-ui-muted mt-1 block text-xs font-medium">
                      {t("action.search.photo")}
                    </span>
                  )}
                  {cmd.subtitle && (
                    <p className="text-ui-secondary mt-1 text-[13px] leading-5 [overflow-wrap:anywhere] whitespace-normal">
                      {cmd.subtitle}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-ui-border bg-ui-subtle relative border-t px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4">
          <div className="text-ui-secondary flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums">
            <span aria-live="polite">{resultSummary}</span>
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
