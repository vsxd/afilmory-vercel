import { clsxm, Spring } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import type { PhotoManifest } from "~/types/photo";

import { SharePanel } from "./SharePanel";

const viewerToolbarButtonClassName =
  "bg-material-ultra-thick pointer-events-auto flex size-10 items-center justify-center rounded-full text-white shadow-lg shadow-black/20 backdrop-blur-xl transition-[background-color,box-shadow,color,transform] duration-200 hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40";

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
      className={`pointer-events-none absolute ${isMobile ? "top-2 right-2 left-2" : "top-4 right-4 left-4"} z-30 flex items-center justify-between`}
    >
      <div className="flex items-center gap-2">
        {isMobile && (
          <button
            type="button"
            aria-label={t("photo.viewer.info")}
            aria-pressed={showExifPanel}
            title={t("photo.viewer.info")}
            className={clsxm(
              viewerToolbarButtonClassName,
              showExifPanel && "bg-accent hover:bg-accent/90",
            )}
            onClick={onToggleExifPanel}
          >
            <i className="i-mingcute-information-line" />
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
              <i className="i-mingcute-share-2-line" />
            </button>
          }
        />

        <button
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          className={viewerToolbarButtonClassName}
          onClick={onClose}
        >
          <i className="i-mingcute-close-line" />
        </button>
      </div>
    </m.div>
  );
};
