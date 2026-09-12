import "./Exif.css";

import { ScrollArea, Spring } from "@afilmory/ui";
import { m } from "motion/react";
import type { FC, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useMobile } from "~/hooks/useMobile";
import { translateDynamicKey } from "~/lib/i18n-dynamic";
import type { PhotoExif, PhotoManifest } from "~/types/photo";

import { createExifPanelViewModel } from "./exif-panel-view-model";
import { ExifPanelSections } from "./ExifPanelSections";
import type { ExifTranslationAdapter } from "./formatExifData";
import { RawExifViewer } from "./RawExifViewer";

export const ExifPanel: FC<{
  currentPhoto: PhotoManifest;
  exifData: PhotoExif | null;
  onClose?: () => void;
  visible?: boolean;
  mobileControls?: ReactNode;
}> = ({ currentPhoto, exifData, onClose, visible = true, mobileControls }) => {
  const { t, i18n } = useTranslation();
  const isMobile = useMobile();
  const sectionT = useCallback(
    (key: string) => translateDynamicKey(i18n, key),
    [i18n],
  );
  const exifTranslator = useMemo<ExifTranslationAdapter>(
    () => ({
      language: i18n.language,
      exists: (key) => i18n.exists(key),
      t: (key, props) => translateDynamicKey(i18n, key, props),
    }),
    [i18n],
  );
  const viewModel = useMemo(
    () =>
      createExifPanelViewModel({
        currentPhoto,
        exifData,
        translator: exifTranslator,
      }),
    [currentPhoto, exifData, exifTranslator],
  );

  return (
    <m.div
      className={`${
        isMobile ? "exif-panel-mobile" : "w-80 shrink-0"
      } af-panel text-ui relative flex size-full min-h-0 flex-col overflow-hidden overscroll-contain border-t lg:border-t-0 lg:border-l`}
      data-photo-info
      initial={{
        opacity: 0,
        ...(isMobile ? { y: 0 } : { x: 100 }),
      }}
      animate={{
        opacity: visible ? 1 : 0,
        ...(isMobile ? { y: 0 } : { x: visible ? 0 : 100 }),
      }}
      exit={{
        opacity: 0,
        ...(isMobile ? { y: 0 } : { x: 100 }),
      }}
      transition={Spring.presets.smooth}
      style={{
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="af-viewer-info-heading relative z-10 flex shrink-0 items-center justify-between gap-2 p-4">
        <h3 className="text-base font-semibold tracking-tight">
          {t("exif.header.title")}
        </h3>
        <div className="flex items-center gap-2">
          <RawExifViewer currentPhoto={currentPhoto} />
          {isMobile && onClose && (
            <button
              type="button"
              aria-label={t("photo.viewer.info-close", {
                defaultValue: "Close photo information",
              })}
              title={t("photo.viewer.info-close", {
                defaultValue: "Close photo information",
              })}
              className="af-control flex size-11 items-center justify-center rounded-full"
              onClick={onClose}
            >
              <i className="i-mingcute-close-line size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {isMobile && mobileControls}

      <ScrollArea
        rootClassName="flex-1 min-h-0 overflow-auto lg:overflow-hidden"
        viewportClassName={
          isMobile
            ? "px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] **:select-text"
            : "px-4 pb-4 **:select-text"
        }
      >
        <div className="space-y-5">
          <ExifPanelSections
            currentPhoto={currentPhoto}
            t={sectionT}
            viewModel={viewModel}
          />
        </div>
      </ScrollArea>
    </m.div>
  );
};
