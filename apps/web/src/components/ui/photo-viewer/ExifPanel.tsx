import "./PhotoViewer.css";

import type { PhotoManifestItem, PickedExif } from "@afilmory/schema";
import { ScrollArea, Spring } from "@afilmory/ui";
import { m } from "motion/react";
import type { FC } from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useMobile } from "~/hooks/useMobile";
import { translateDynamicKey } from "~/lib/i18n-dynamic";

import { createExifPanelViewModel } from "./exif-panel-view-model";
import {
  BasicExifSection,
  FormattedExifSections,
  ToneExifSection,
} from "./ExifPanelSections";
import type { ExifTranslationAdapter } from "./formatExifData";
import { RawExifViewer } from "./RawExifViewer";

export const ExifPanel: FC<{
  currentPhoto: PhotoManifestItem;
  exifData: PickedExif | null;
  onClose?: () => void;
  onTagClick?: (tag: string) => void;
  visible?: boolean;
}> = ({ currentPhoto, exifData, onClose, onTagClick, visible = true }) => {
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
        isMobile
          ? "exif-panel-mobile fixed right-0 bottom-0 left-0 z-10 max-h-[60vh] w-full rounded-t-2xl backdrop-blur-2xl"
          : "relative w-80 shrink-0 backdrop-blur-2xl"
      } border-accent/20 flex flex-col text-white`}
      initial={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      animate={{
        opacity: visible ? 1 : 0,
        ...(isMobile ? { y: visible ? 0 : 100 } : { x: visible ? 0 : 100 }),
      }}
      exit={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      transition={Spring.presets.smooth}
      style={{
        pointerEvents: visible ? "auto" : "none",
        backgroundImage:
          "linear-gradient(to bottom right, rgba(var(--color-materialMedium)), rgba(var(--color-materialThick)), transparent)",
        boxShadow:
          "0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))",
        }}
      />
      <div className="relative z-10 mb-4 flex shrink-0 items-center justify-between p-4 pb-0">
        <h3 className={`${isMobile ? "text-base" : "text-lg"} font-semibold`}>
          {t("exif.header.title")}
        </h3>
        <div className="flex items-center gap-2">
          <RawExifViewer currentPhoto={currentPhoto} />
          {isMobile && onClose && (
            <button
              type="button"
              aria-label={t("common.close", { defaultValue: "Close" })}
              title={t("common.close", { defaultValue: "Close" })}
              className="glassmorphic-btn border-accent/20 focus-visible:ring-accent/45 flex size-10 items-center justify-center rounded-full border text-white/70 transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-inset"
              onClick={onClose}
            >
              <i className="i-mingcute-close-line text-base" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea
        rootClassName="flex-1 min-h-0 overflow-auto lg:overflow-hidden"
        viewportClassName="px-4 pb-4 **:select-text"
      >
        <div className={`space-y-${isMobile ? "3" : "4"}`}>
          <BasicExifSection
            currentPhoto={currentPhoto}
            onTagClick={onTagClick}
            t={sectionT}
            viewModel={viewModel}
          />
          <ToneExifSection currentPhoto={currentPhoto} t={sectionT} />
          <FormattedExifSections
            currentPhoto={currentPhoto}
            t={sectionT}
            viewModel={viewModel}
          />
        </div>
      </ScrollArea>
    </m.div>
  );
};
