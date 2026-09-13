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

import { useDialogFocusManagement } from "~/hooks/useDialogFocusManagement";
import { useMobile } from "~/hooks/useMobile";
import { useModalIsolation } from "~/hooks/useModalIsolation";
import { usePanelDragDismiss } from "~/hooks/usePanelDragDismiss";
import { getViewerPhotos, usePhotos } from "~/hooks/usePhotoViewer";
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
import { CommandResultGroups } from "./CommandResultGroups";
import { resolveCommandKeyboardIntent } from "./keyboard";
import type { Command, CommandAction } from "./model";
import {
  applyGalleryCommandAction,
  buildActiveFilterChips,
  buildCommandIndex,
  buildPhotoCommands,
  getActiveFilterCount,
  getAvailableFilterCount,
  groupCommandResults,
} from "./model";
import { buildPhotoSearchIndex, searchPhotoIndex } from "./search";
import { useCommandViewport } from "./useCommandViewport";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoOpen?: () => void;
  restoreFocusOnClose?: boolean;
}

const DISMISS_DRAG_THRESHOLD = 72;

export const CommandPalette = ({
  isOpen,
  onClose,
  onPhotoOpen,
  restoreFocusOnClose = true,
}: CommandPaletteProps) => {
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
  const matchingPhotos = usePhotos();
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoReturnFocusId, setPhotoReturnFocusId] = useState<string | null>(
    null,
  );
  const shouldReduceMotion = useReducedMotion() === true;
  const isMobile = useMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const setListRef = useCallback((element: HTMLDivElement | null) => {
    if (listRef.current) scrollTopRef.current = listRef.current.scrollTop;
    listRef.current = element;
    if (element) element.scrollTop = scrollTopRef.current;
  }, []);

  const handleClose = useCallback(() => {
    setPhotoReturnFocusId(null);
    onClose();
  }, [onClose]);
  useModalIsolation(isOpen);
  useCommandViewport(viewportRef, isOpen && isMobile);

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
    onDismiss: handleClose,
    threshold: DISMISS_DRAG_THRESHOLD,
  });

  const activeFilterCount = getActiveFilterCount(gallerySetting);

  const hasFilters = activeFilterCount > 0;

  const handleClearFilters = useCallback(() => {
    setGallerySetting((prev) =>
      applyGalleryCommandAction(prev, { type: "clear-filters" }),
    );
  }, [setGallerySetting]);

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setSelectedId(null);
    setPhotoReturnFocusId(null);
    scrollTopRef.current = 0;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, []);

  const clearQuery = useCallback(() => {
    updateQuery("");
    inputRef.current?.focus();
  }, [updateQuery]);

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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  const openPhoto = useCallback(
    (photo: PhotoManifest) => {
      const viewerPhotos = getViewerPhotos(runtime, photo.id);
      const photoIndex = viewerPhotos.findIndex((item) => item.id === photo.id);
      if (photoIndex === -1) {
        return;
      }

      setPhotoReturnFocusId(`photo-${photo.id}`);
      if (onPhotoOpen) onPhotoOpen();
      else onClose();
      navigation.openPhoto(photo.id, {
        photoIds: viewerPhotos.map((photo) => photo.id),
      });
    },
    [navigation, onClose, onPhotoOpen, runtime],
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
        language: i18n.language,
        photos: searchPhotoIndex(photoSearchIndex, deferredQuery, 10),
      }),
    [commandT, deferredQuery, i18n.language, photoSearchIndex],
  );
  const commands = useMemo(
    () => [...baseCommands, ...photoCommands],
    [baseCommands, photoCommands],
  );

  const filteredGroups = useMemo(
    () => groupCommandResults(commands, deferredQuery),
    [commands, deferredQuery],
  );
  const isBrowsingFilters = !query.trim();
  const visibleGroups = useMemo(
    () => (!isBrowsingFilters && query === deferredQuery ? filteredGroups : []),
    [deferredQuery, filteredGroups, isBrowsingFilters, query],
  );
  const visibleCommands = useMemo(
    () => visibleGroups.flatMap((group) => group.commands),
    [visibleGroups],
  );
  const selectedIndex = Math.max(
    0,
    visibleCommands.findIndex((command) => command.id === selectedId),
  );
  const selectedCommand = visibleCommands[selectedIndex];
  const returnFocusCommand = visibleCommands.find(
    (command) => command.id === photoReturnFocusId,
  );
  useDialogFocusManagement({
    dialogRef: panelRef,
    focusContainerOnOpen: isMobile && !returnFocusCommand,
    initialFocusSelector: returnFocusCommand
      ? `[id="${getOptionDomId(returnFocusCommand.id)}"]`
      : '[name="gallery-search"]',
    isOpen,
    restoreFocusOnClose,
    retainReturnFocusOnSuspend: true,
  });

  const selectCommand = useCallback(
    (command: Command) => setSelectedId(command.id),
    [],
  );
  const executeCommand = useCallback(
    (command: Command) => {
      setSelectedId(command.id);
      executeCommandAction(command.action);
    },
    [executeCommandAction],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;
      const fromResults = e.currentTarget === listRef.current;
      // Focused result buttons already execute Enter through their native click.
      if (fromResults && e.key === "Enter") return;
      const intent = resolveCommandKeyboardIntent(e.key, {
        selectedIndex,
        resultCount: visibleCommands.length,
      });

      if (intent.type === "none") {
        return;
      }

      e.preventDefault();
      if (intent.type === "move") {
        const command = visibleCommands[intent.selectedIndex];
        setSelectedId(command.id);
        const option = listRef.current?.querySelector<HTMLElement>(
          `[id="${getOptionDomId(command.id)}"]`,
        );
        if (fromResults) option?.focus({ preventScroll: true });
        option?.scrollIntoView({
          block: "nearest",
          behavior: shouldReduceMotion ? "auto" : "smooth",
        });
        return;
      }

      const command = visibleCommands[intent.selectedIndex];
      if (command) {
        executeCommand(command);
      }
    },
    [
      executeCommand,
      getOptionDomId,
      selectedIndex,
      shouldReduceMotion,
      visibleCommands,
    ],
  );

  if (!isOpen) return null;

  const availableFilterCount = getAvailableFilterCount({
    allTags,
    allCameras,
    allLenses,
    geoRegions,
  });
  const resultSummary = query.trim()
    ? t("action.search.grouped-summary", {
        filters:
          visibleGroups.find((group) => group.type === "filters")?.commands
            .length ?? 0,
        photos:
          visibleGroups.find((group) => group.type === "photos")?.commands
            .length ?? 0,
      })
    : t("action.search.showing-filters", { count: availableFilterCount });

  // 读屏器可见性：只有真正渲染选项列表时 combobox 才算 expanded，
  // aria-activedescendant 跟着高亮项走，箭头键选中什么用户就听到什么。
  const isListboxVisible = !isBrowsingFilters && visibleCommands.length > 0;
  const activeOptionDomId =
    isListboxVisible && selectedCommand
      ? getOptionDomId(selectedCommand.id)
      : undefined;

  return (
    <div
      ref={viewportRef}
      data-photo-viewer-nested-overlay
      className="af-command-viewport fixed inset-0 z-[9999] flex items-end justify-center"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 bg-black/30 backdrop-blur-xl transition-[background-color,backdrop-filter] duration-200"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        data-command-palette
        role="dialog"
        aria-modal="true"
        aria-label={t("action.search.unified.title")}
        tabIndex={-1}
        className="af-command-panel af-popover animate-in fade-in slide-in-from-bottom-4 relative flex w-full max-w-3xl flex-col overflow-hidden overscroll-contain rounded-t-[1.75rem] duration-200 outline-none lg:mb-6 lg:rounded-[1.75rem]"
        style={{
          transform: `translateY(${panelDragOffset}px)`,
          transition: isDraggingPanel ? "none" : "transform 180ms ease-out",
        }}
      >
        <div
          ref={dragHandleRef}
          className="flex h-[var(--af-command-handle-height,2.25rem)] shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <div className="bg-ui-hover h-1 w-10 rounded-full" />
        </div>
        <header className="border-ui-border shrink-0 border-b px-4 pb-[var(--af-command-header-padding,1rem)] sm:px-6">
          <div
            data-command-heading
            className="mb-[var(--af-command-heading-gap,0.75rem)] items-center justify-between gap-3"
          >
            <h2 className="text-ui text-lg leading-tight font-semibold text-pretty">
              {t("action.search.unified.title")}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="af-control flex size-11 shrink-0 items-center justify-center rounded-xl"
              aria-label={t("common.close")}
            >
              <i
                className="i-mingcute-close-line text-base"
                aria-hidden="true"
              />
            </button>
          </div>
          <div className="af-input-shell flex h-12 items-center gap-3 rounded-2xl pr-1 pl-3">
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
              onChange={(event) => updateQuery(event.target.value)}
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
            {query && (
              <button
                type="button"
                className="af-control flex size-11 shrink-0 items-center justify-center rounded-xl"
                aria-label={t("action.search.clear-query")}
                onClick={clearQuery}
              >
                <i
                  className="i-mingcute-close-line text-base"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </header>
        <div
          data-command-filter-state
          className="border-ui-border shrink-0 border-b px-4 py-[var(--af-command-state-padding,0.5rem)] sm:px-6"
        >
          <div className="flex min-h-9 items-center justify-between gap-3">
            <p className="text-ui-secondary flex flex-wrap items-baseline gap-x-2 text-xs">
              <span>{t("action.search.gallery-label")}</span>
              <span
                data-command-match-count
                aria-live="polite"
                className="text-ui text-sm font-medium tabular-nums"
              >
                {t("action.search.gallery-matches", {
                  count: matchingPhotos.length,
                })}
              </span>
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="af-control min-h-11 shrink-0 rounded-xl px-3 text-xs font-medium"
              >
                {t("action.search.clear-filters")}
              </button>
            )}
          </div>
          {hasFilters && (
            <div
              className="-mx-1 flex items-start gap-2 overflow-x-auto px-1 pt-1 pb-1"
              aria-label={t("action.search.active-filters", {
                count: activeFilterCount,
              })}
            >
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => executeCommandAction(chip.action)}
                  className="af-control flex min-h-11 max-w-[min(16rem,100%)] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-xs leading-5 font-medium [--af-focus-offset:-2px]"
                  aria-label={`${t("action.search.clear")} ${chip.label}`}
                >
                  <i
                    className={clsxm(chip.icon, "shrink-0 text-sm")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate">{chip.label}</span>
                  <i
                    className="i-mingcute-close-line shrink-0 text-sm"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          ref={setListRef}
          data-command-results
          onKeyDown={handleKeyDown}
          id={isListboxVisible ? listboxDomId : undefined}
          role={isListboxVisible ? "listbox" : undefined}
          aria-label={
            isListboxVisible ? t("action.search.unified.title") : undefined
          }
          onScroll={(event) => {
            scrollTopRef.current = event.currentTarget.scrollTop;
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3"
        >
          {isBrowsingFilters ? (
            <FilterPanel
              showHeader={false}
              className="max-h-none overflow-visible px-2 pt-1 pb-5 sm:px-3"
            />
          ) : visibleCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <i
                className="i-mingcute-search-line text-ui-muted mb-3 text-3xl"
                aria-hidden="true"
              />
              <p className="text-ui-secondary text-sm">
                {t("action.search.no-results")}
              </p>
              <button
                type="button"
                className="af-control mt-4 min-h-11 rounded-xl px-4 text-sm font-medium"
                onClick={clearQuery}
              >
                {t("action.search.clear-query")}
              </button>
            </div>
          ) : (
            <CommandResultGroups
              groups={visibleGroups}
              photoCount={allPhotos.length}
              selectedCommandId={selectedCommand?.id}
              getOptionDomId={getOptionDomId}
              onSelect={selectCommand}
              onExecute={executeCommand}
            />
          )}
        </div>
        <footer className="border-ui-border bg-ui-subtle flex shrink-0 items-center justify-between gap-4 border-t px-4 pt-[var(--af-command-footer-padding,0.75rem)] pb-[calc(var(--af-command-footer-padding,1rem)+env(safe-area-inset-bottom))] sm:px-6 lg:pb-4">
          <span aria-live="polite" className="sr-only">
            {resultSummary}
          </span>
          <span
            className="text-ui-muted hidden text-xs lg:block"
            aria-hidden="true"
          >
            {t("action.search.keyboard-hint")}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="af-control flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium lg:w-auto"
          >
            {t("action.search.view-photos", { count: matchingPhotos.length })}
            <i
              className="i-mingcute-arrow-right-up-line text-base"
              aria-hidden="true"
            />
          </button>
        </footer>
      </div>
    </div>
  );
};
