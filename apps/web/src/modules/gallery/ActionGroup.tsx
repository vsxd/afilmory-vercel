import { Button, clsxm } from "@afilmory/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  isCommandPaletteOpenAtom,
  responsiveGalleryColumnsAtom,
} from "~/atoms/app";
import { siteConfig } from "~/config";
import { useAppNavigation, useGallerySettings } from "~/navigation/hooks";

import { ResponsiveActionButton } from "./components/ActionButton";
import { ViewPanel } from "./panels/ViewPanel";

export const ActionGroup = ({
  compact = false,
  onOverlayOpenChange,
}: {
  compact?: boolean;
  onOverlayOpenChange?: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const [gallerySetting] = useGallerySettings();
  const columns = useAtomValue(responsiveGalleryColumnsAtom);
  const setCommandPaletteOpen = useSetAtom(isCommandPaletteOpenAtom);
  const navigation = useAppNavigation();
  const commandPaletteOpen = useAtomValue(isCommandPaletteOpenAtom);
  const openedSearch = useRef(false);

  useEffect(() => {
    if (openedSearch.current && !commandPaletteOpen) {
      openedSearch.current = false;
      onOverlayOpenChange?.(false);
    }
  }, [commandPaletteOpen, onOverlayOpenChange]);

  // 计算视图设置是否有自定义配置
  const hasViewCustomization =
    columns !== "auto" || gallerySetting.sortOrder !== "desc";

  // 计算过滤器数量
  const filterCount =
    gallerySetting.selectedTags.length +
    gallerySetting.selectedCameras.length +
    gallerySetting.selectedLenses.length +
    gallerySetting.selectedGeoCountries.length +
    gallerySetting.selectedGeoRegions.length +
    gallerySetting.selectedGeoCities.length +
    gallerySetting.selectedGeoDistricts.length;

  return (
    <div
      className={clsxm(
        "flex items-center justify-center gap-1.5",
        !compact && "@container/gallery-actions",
      )}
    >
      {/* 搜索和过滤按钮 - 打开命令面板 */}
      <Button
        variant="surface"
        size="sm"
        onClick={() => {
          openedSearch.current = true;
          onOverlayOpenChange?.(true);
          setCommandPaletteOpen(true);
        }}
        className={clsxm(
          "af-control relative h-11 min-w-11 gap-2 rounded-xl px-3",
          !compact && "flex-1 @[200px]/gallery-actions:justify-start",
        )}
        data-gallery-search
        aria-label={t("action.search.unified.title")}
        title={t("action.search.unified.title")}
      >
        <i
          className="i-mingcute-search-line shrink-0 text-lg"
          aria-hidden="true"
        />
        {!compact && (
          <span className="text-ui-secondary hidden truncate text-xs font-normal @[200px]/gallery-actions:inline">
            {t("action.search.unified.title")}
          </span>
        )}
        {filterCount > 0 && (
          <span className="bg-accent text-accent-content absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums">
            {filterCount}
          </span>
        )}
      </Button>

      {siteConfig.map && siteConfig.map.length > 0 ? (
        <Button
          variant="surface"
          size="sm"
          onClick={() => navigation.showMap()}
          className="af-control h-11 w-11 shrink-0 rounded-xl"
          aria-label={t("action.map.explore")}
          title={t("action.map.explore")}
        >
          <i aria-hidden="true" className="i-mingcute-map-pin-line text-lg" />
        </Button>
      ) : null}

      {/* 视图设置按钮（合并排序和列数） */}
      <ResponsiveActionButton
        icon="i-mingcute-layout-grid-line"
        title={t("action.view.title")}
        badge={hasViewCustomization ? "●" : undefined}
        contentClassName="af-popover w-[24rem] max-w-[calc(100vw-2rem)] rounded-2xl p-0"
        onGlobalOpenChange={onOverlayOpenChange}
      >
        <ViewPanel />
      </ResponsiveActionButton>
    </div>
  );
};
