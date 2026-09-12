import { Spring } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import type { ViewerSequenceSource } from "~/hooks/usePhotoViewer";
import type { PhotoManifest } from "~/types/photo";

import { SharePanel } from "./SharePanel";

const viewerToolbarButtonClassName =
  "af-glass af-control pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full";

interface PhotoViewerToolbarProps {
  currentPhoto: PhotoManifest;
  currentBlobSrc: string | null;
  sequenceSource: ViewerSequenceSource;
  currentIndex: number;
  totalPhotos: number;
  isMobile: boolean;
  isVisible: boolean;
  showExifPanel: boolean;
  onToggleExifPanel: () => void;
  onClose: () => void;
}

export const PhotoViewerToolbar = ({
  currentPhoto,
  currentBlobSrc,
  sequenceSource,
  currentIndex,
  totalPhotos,
  isMobile,
  isVisible,
  showExifPanel,
  onToggleExifPanel,
  onClose,
}: PhotoViewerToolbarProps) => {
  const { t } = useTranslation();
  const sourceLabel = {
    all: t("photo.viewer.sequence.all"),
    filtered: t("photo.viewer.sequence.filtered"),
    map: t("photo.viewer.sequence.map"),
    sequence: t("photo.viewer.sequence.sequence"),
  }[sequenceSource];

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={Spring.presets.snappy}
      className={`af-viewer-toolbar pointer-events-none absolute ${isMobile ? "top-[calc(env(safe-area-inset-top)+0.5rem)] right-[calc(env(safe-area-inset-right)+0.5rem)] left-[calc(env(safe-area-inset-left)+0.5rem)]" : "top-4 right-4 left-4"} z-30 flex items-center justify-between gap-2`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isMobile && (
          <button
            type="button"
            data-photo-viewer-info-toggle
            aria-label={t("photo.viewer.info")}
            aria-pressed={showExifPanel}
            data-variant="solid"
            title={t("photo.viewer.info")}
            className={viewerToolbarButtonClassName}
            onClick={onToggleExifPanel}
          >
            <i
              className="i-mingcute-information-line size-5"
              aria-hidden="true"
            />
          </button>
        )}
        <div
          role="status"
          aria-atomic="true"
          data-photo-viewer-sequence={sequenceSource}
          className="af-glass flex min-h-11 min-w-0 flex-col justify-center rounded-2xl px-3 py-1"
          title={sourceLabel}
        >
          <span className="sr-only">
            {t("photo.viewer.sequence.position", {
              source: sourceLabel,
              position: currentIndex + 1,
              total: totalPhotos,
            })}
          </span>
          <span
            aria-hidden="true"
            className="text-ui-secondary truncate text-[11px] leading-4"
          >
            {sourceLabel}
          </span>
          <span
            aria-hidden="true"
            className="text-ui text-xs leading-4 font-medium whitespace-nowrap tabular-nums"
          >
            {currentIndex + 1}
            <span className="text-ui-secondary font-normal">
              {" / "}
              {totalPhotos}
            </span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SharePanel
          photo={currentPhoto}
          blobSrc={currentBlobSrc || undefined}
          trigger={
            <button
              type="button"
              className={viewerToolbarButtonClassName}
              aria-label={t("photo.share.title")}
              title={t("photo.share.title")}
            >
              <i
                className="i-mingcute-share-2-line size-5"
                aria-hidden="true"
              />
            </button>
          }
        />

        <button
          type="button"
          data-photo-viewer-close
          aria-label={t("common.close")}
          title={t("common.close")}
          className={viewerToolbarButtonClassName}
          onClick={onClose}
        >
          <i className="i-mingcute-close-line size-5" aria-hidden="true" />
        </button>
      </div>
    </m.div>
  );
};
