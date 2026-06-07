import { Spring } from "@afilmory/ui";
import { m } from "motion/react";
import type { RefObject } from "react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { Swiper as SwiperType } from "swiper";
import { Navigation, Virtual } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import type { PhotoManifest } from "~/types/photo";

import type { LoadingIndicatorRef } from "./LoadingIndicator";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProgressiveImage } from "./ProgressiveImage";

const viewerNavButtonClassName =
  "bg-material-medium absolute top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 shadow-lg shadow-black/20 backdrop-blur-xl transition-[background-color,box-shadow,opacity,transform] duration-200 group-hover:opacity-100 hover:bg-black/40 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40";

interface PhotoViewerMediaCarouselProps {
  photos: PhotoManifest[];
  currentPhoto: PhotoManifest;
  currentIndex: number;
  isOpen: boolean;
  isMobile: boolean;
  isImageZoomed: boolean;
  isViewerContentVisible: boolean;
  isEntryAnimating: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  loadingIndicatorRef: RefObject<LoadingIndicatorRef | null>;
  onSwiperReady: (swiper: SwiperType) => void;
  onSlideChange: (swiper: SwiperType) => void;
  onPrevious: () => void;
  onNext: () => void;
  onZoomChange: (isZoomed: boolean) => void;
  onBlobSrcChange: (blobSrc: string | null) => void;
}

export const PhotoViewerMediaCarousel = ({
  photos,
  currentPhoto,
  currentIndex,
  isOpen,
  isMobile,
  isImageZoomed,
  isViewerContentVisible,
  isEntryAnimating,
  canGoPrevious,
  canGoNext,
  loadingIndicatorRef,
  onSwiperReady,
  onSlideChange,
  onPrevious,
  onNext,
  onZoomChange,
  onBlobSrcChange,
}: PhotoViewerMediaCarouselProps) => {
  const { t } = useTranslation();

  return (
    <m.div
      className="group relative flex min-h-0 min-w-0 flex-1"
      animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
      transition={Spring.presets.snappy}
    >
      <LoadingIndicator ref={loadingIndicatorRef} />
      <Swiper
        modules={[Navigation, Virtual]}
        spaceBetween={0}
        slidesPerView={1}
        initialSlide={currentIndex}
        virtual
        onSwiper={onSwiperReady}
        onSlideChange={onSlideChange}
        className="h-full w-full"
        style={{ touchAction: isMobile ? "pan-x" : "pan-y" }}
      >
        {photos.map((photo, index) => {
          const isCurrentImage = index === currentIndex;
          const hideCurrentImage = isEntryAnimating && isCurrentImage;

          return (
            <SwiperSlide
              key={photo.id}
              className="flex items-center justify-center"
              virtualIndex={index}
            >
              <m.div
                initial={{ opacity: 0.5, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={Spring.presets.smooth}
                className="relative flex h-full w-full items-center justify-center"
                style={{
                  visibility: hideCurrentImage ? "hidden" : "visible",
                }}
              >
                <ProgressiveImage
                  photoId={photo.id}
                  loadingIndicatorRef={loadingIndicatorRef}
                  isCurrentImage={isCurrentImage}
                  src={photo.originalUrl}
                  thumbnailSrc={photo.thumbnailUrl}
                  thumbHash={photo.thumbHash}
                  alt={photo.title}
                  width={isCurrentImage ? currentPhoto.width : undefined}
                  height={isCurrentImage ? currentPhoto.height : undefined}
                  className="h-full w-full object-contain"
                  enablePan={isCurrentImage ? !isMobile || isImageZoomed : true}
                  enableZoom={true}
                  shouldRenderHighRes={isViewerContentVisible && isOpen}
                  onZoomChange={isCurrentImage ? onZoomChange : undefined}
                  onBlobSrcChange={isCurrentImage ? onBlobSrcChange : undefined}
                  videoSource={
                    photo.video?.type === "motion-photo"
                      ? {
                          type: "motion-photo",
                          imageUrl: photo.originalUrl,
                          offset: photo.video.offset,
                          size: photo.video.size,
                          presentationTimestamp:
                            photo.video.presentationTimestamp,
                        }
                      : photo.video?.type === "live-photo"
                        ? {
                            type: "live-photo",
                            videoUrl: photo.video.videoUrl,
                          }
                        : { type: "none" }
                  }
                  shouldAutoPlayVideoOnce={isCurrentImage}
                  isHDR={photo.isHDR}
                />
              </m.div>
            </SwiperSlide>
          );
        })}
      </Swiper>

      {!isMobile && (
        <Fragment>
          {canGoPrevious && (
            <button
              type="button"
              aria-label={t("photo.viewer.previous")}
              title={t("photo.viewer.previous")}
              className={`${viewerNavButtonClassName} left-4`}
              onClick={onPrevious}
            >
              <i className="i-mingcute-left-line text-xl" />
            </button>
          )}

          {canGoNext && (
            <button
              type="button"
              aria-label={t("photo.viewer.next")}
              title={t("photo.viewer.next")}
              className={`${viewerNavButtonClassName} right-4`}
              onClick={onNext}
            >
              <i className="i-mingcute-right-line text-xl" />
            </button>
          )}
        </Fragment>
      )}
    </m.div>
  );
};
