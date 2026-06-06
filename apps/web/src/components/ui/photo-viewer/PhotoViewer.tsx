import "./PhotoViewer.css";
// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";

import { Spring, Thumbhash } from "@afilmory/ui";
import { AnimatePresence, m } from "motion/react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Swiper as SwiperType } from "swiper";

import { useExifPanel } from "~/hooks/useExifPanel";
import { useMobile } from "~/hooks/useMobile";
import { usePhotoNavigation } from "~/hooks/usePhotoNavigation";
import type { PhotoManifest } from "~/types/photo";

import { PhotoViewerTransitionPreview } from "./animations/PhotoViewerTransitionPreview";
import { usePhotoViewerTransitions } from "./animations/usePhotoViewerTransitions";
import { ExifPanel } from "./ExifPanel";
import { GalleryThumbnail } from "./GalleryThumbnail";
import type { LoadingIndicatorRef } from "./LoadingIndicator";
import { PhotoViewerMediaCarousel } from "./PhotoViewerMediaCarousel";
import { PhotoViewerToolbar } from "./PhotoViewerToolbar";

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
};

const hasNestedKeyboardOverlay = (): boolean => {
  return document.querySelector("[data-photo-viewer-nested-overlay]") !== null;
};

interface PhotoViewerProps {
  photos: PhotoManifest[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  triggerElement: HTMLElement | null;
}

export const PhotoViewer = ({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
  triggerElement,
}: PhotoViewerProps) => {
  const { t } = useTranslation();
  const swiperRef = useRef<SwiperType | null>(null);
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const { showExifPanel, toggleExifPanel, closeExifPanel } = useExifPanel();
  const [currentBlobSrc, setCurrentBlobSrc] = useState<string | null>(null);

  const isMobile = useMobile();
  const currentPhoto = photos[currentIndex];

  const {
    containerRef,
    entryTransition,
    exitTransition,
    isViewerContentVisible,
    isEntryAnimating,
    shouldRenderBackdrop,
    thumbHash: transitionThumbHash,
    shouldRenderThumbhash,
    handleEntryAnimationComplete,
    handleExitAnimationComplete,
  } = usePhotoViewerTransitions({
    isOpen,
    triggerElement,
    currentPhoto,
    currentBlobSrc,
    isMobile,
  });

  const { handlePrevious, handleNext, canGoPrevious, canGoNext } =
    usePhotoNavigation({
      currentIndex,
      totalPhotos: photos.length,
      onIndexChange,
      swiperRef: swiperRef as React.RefObject<any>,
    });

  useEffect(() => {
    if (!isOpen) {
      setIsImageZoomed(false);
      closeExifPanel();
      setCurrentBlobSrc(null);
    }
  }, [isOpen, closeExifPanel]);

  // 同步 Swiper 的索引
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentIndex) {
      swiperRef.current.slideTo(currentIndex, 300);
    }
    // 切换图片时重置缩放状态
    setIsImageZoomed(false);
  }, [currentIndex]);

  // 当图片缩放状态改变时，控制 Swiper 的触摸行为
  useEffect(() => {
    if (swiperRef.current) {
      if (isImageZoomed) {
        // 图片被缩放时，禁用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = false;
      } else {
        // 图片未缩放时，启用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = true;
      }
    }
  }, [isImageZoomed]);

  const loadingIndicatorRef = useRef<LoadingIndicatorRef>(null);
  // 处理图片缩放状态变化
  const handleZoomChange = useCallback((isZoomed: boolean) => {
    setIsImageZoomed(isZoomed);
  }, []);

  // 处理 blobSrc 变化
  const handleBlobSrcChange = useCallback((blobSrc: string | null) => {
    setCurrentBlobSrc(blobSrc);
  }, []);

  const handleSwiperReady = useCallback(
    (swiper: SwiperType) => {
      swiperRef.current = swiper;
      // 初始化时确保触摸滑动是启用的
      swiper.allowTouchMove = !isImageZoomed;
    },
    [isImageZoomed],
  );

  const handleSlideChange = useCallback(
    (swiper: SwiperType) => {
      onIndexChange(swiper.activeIndex);
    },
    [onIndexChange],
  );

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      if (hasNestedKeyboardOverlay()) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          handlePrevious();
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          handleNext();
          break;
        }
        case "Escape": {
          event.preventDefault();
          onClose();
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handlePrevious, handleNext, onClose]);

  if (!currentPhoto) return null;

  const currentThumbHash = transitionThumbHash;

  return (
    <>
      <AnimatePresence>
        {shouldRenderBackdrop && (
          <m.div
            key="photo-viewer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: isOpen ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
            className="bg-material-opaque fixed inset-0"
          />
        )}
      </AnimatePresence>
      {/* 固定背景层防止透出 */}
      {/* 交叉溶解的 Blurhash 背景 */}
      <AnimatePresence mode="sync">
        {shouldRenderThumbhash && (
          <m.div
            key={`${currentPhoto.id}-thumbhash`}
            initial={{ opacity: 0 }}
            animate={{ opacity: isOpen ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
            className="fixed inset-0"
          >
            {currentThumbHash && (
              <Thumbhash
                thumbHash={currentThumbHash}
                className="size-fill scale-110"
              />
            )}
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <m.div
            ref={containerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t("photo.viewer.label")}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
              touchAction: isMobile ? "manipulation" : "none",
              pointerEvents:
                !isViewerContentVisible || isEntryAnimating ? "none" : "auto",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
          >
            <div
              className={`flex size-full ${isMobile ? "flex-col" : "flex-row"}`}
            >
              <div className="relative z-1 flex min-h-0 min-w-0 flex-1 flex-col">
                <PhotoViewerToolbar
                  currentPhoto={currentPhoto}
                  currentBlobSrc={currentBlobSrc}
                  isMobile={isMobile}
                  isVisible={isViewerContentVisible}
                  showExifPanel={showExifPanel}
                  onToggleExifPanel={toggleExifPanel}
                  onClose={onClose}
                />
                <PhotoViewerMediaCarousel
                  photos={photos}
                  currentPhoto={currentPhoto}
                  currentIndex={currentIndex}
                  isOpen={isOpen}
                  isMobile={isMobile}
                  isImageZoomed={isImageZoomed}
                  isViewerContentVisible={isViewerContentVisible}
                  isEntryAnimating={isEntryAnimating}
                  canGoPrevious={canGoPrevious}
                  canGoNext={canGoNext}
                  loadingIndicatorRef={loadingIndicatorRef}
                  onSwiperReady={handleSwiperReady}
                  onSlideChange={handleSlideChange}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  onZoomChange={handleZoomChange}
                  onBlobSrcChange={handleBlobSrcChange}
                />

                <Suspense>
                  <GalleryThumbnail
                    currentIndex={currentIndex}
                    photos={photos}
                    onIndexChange={onIndexChange}
                    visible={isViewerContentVisible}
                  />
                </Suspense>
              </div>

              {/* ExifPanel - 在桌面端始终显示，在移动端根据状态显示 */}

              <Suspense>
                <AnimatePresenceOnlyMobile>
                  {(!isMobile || showExifPanel) && (
                    <ExifPanel
                      currentPhoto={currentPhoto}
                      exifData={currentPhoto.exif}
                      visible={isViewerContentVisible}
                      onClose={isMobile ? closeExifPanel : undefined}
                    />
                  )}
                </AnimatePresenceOnlyMobile>
              </Suspense>
            </div>
          </m.div>
        )}
      </AnimatePresence>
      {entryTransition && (
        <PhotoViewerTransitionPreview
          key={`${entryTransition.variant}-${entryTransition.photoId}`}
          transition={entryTransition}
          onComplete={handleEntryAnimationComplete}
        />
      )}
      {exitTransition && (
        <PhotoViewerTransitionPreview
          key={`${exitTransition.variant}-${exitTransition.photoId}`}
          transition={exitTransition}
          onComplete={handleExitAnimationComplete}
        />
      )}
    </>
  );
};

const AnimatePresenceOnlyMobile = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const isMobile = useMobile();
  if (!isMobile) return children;
  return <AnimatePresence>{children}</AnimatePresence>;
};
