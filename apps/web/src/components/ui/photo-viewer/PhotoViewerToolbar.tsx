import { Spring } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import type { PhotoManifest } from "~/types/photo";

import { SharePanel } from "./SharePanel";

const viewerToolbarButtonClassName =
  "af-glass af-control pointer-events-auto flex size-11 items-center justify-center rounded-full";

interface PhotoViewerToolbarProps {
  currentPhoto: PhotoManifest;
  currentBlobSrc: string | null;
  isMobile: boolean;
  isVisible: boolean;
  showExifPanel: boolean;
  onToggleExifPanel: () => void;
  onClose: () => void;
}

export const PhotoViewerToolbar = ({
  currentPhoto,
  currentBlobSrc,
  isMobile,
  isVisible,
  showExifPanel,
  onToggleExifPanel,
  onClose,
}: PhotoViewerToolbarProps) => {
  const { t } = useTranslation();

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={Spring.presets.snappy}
      className={`pointer-events-none absolute ${isMobile ? "top-[calc(env(safe-area-inset-top)+0.5rem)] right-[calc(env(safe-area-inset-right)+0.5rem)] left-[calc(env(safe-area-inset-left)+0.5rem)]" : "top-4 right-4 left-4"} z-30 flex items-center justify-between`}
    >
      <div className="flex items-center gap-2">
        {isMobile && (
          <button
            type="button"
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
      </div>

      <div className="flex items-center gap-2">
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
