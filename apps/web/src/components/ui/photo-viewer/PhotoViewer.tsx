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
import { buildSingleTagFilterSearch } from "~/lib/gallery-filter-url";
import type { PhotoManifest } from "~/types/photo";

import { PhotoViewerTransitionPreview } from "./animations/PhotoViewerTransitionPreview";
import { usePhotoViewerTransitions } from "./animations/usePhotoViewerTransitions";
import { ExifPanel } from "./ExifPanel";
import { GalleryThumbnail } from "./GalleryThumbnail";
import type { LoadingIndicatorRef } from "./LoadingIndicator";
import {
  usePhotoViewerBlobSource,
  usePhotoViewerKeyboard,
  useSwiperIndexSync,
  useSwiperZoomLock,
} from "./PhotoViewerController";
import { PhotoViewerMediaCarousel } from "./PhotoViewerMediaCarousel";
import { PhotoViewerToolbar } from "./PhotoViewerToolbar";
import type { DismissTransform } from "./useDismissGesture";
import { useDismissGesture } from "./useDismissGesture";

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
  const { currentBlobSrc, resetBlobSource, handleBlobSrcChange } =
    usePhotoViewerBlobSource();

  const isMobile = useMobile();
  const currentPhoto = photos[currentIndex];

  // 下滑关闭：把释放时的拖拽变换交给退出 FLIP，让照片从被拖到的位置无缝飞回原格子
  const dismissTransformRef = useRef<DismissTransform | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

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
    dismissTransformRef,
  });

  const handleDismiss = useCallback(
    (transform: DismissTransform) => {
      dismissTransformRef.current = transform;
      onClose();
    },
    [onClose],
  );

  // 注意：入场动画期间也允许下滑关闭（不再要求 !isEntryAnimating）——认领时会通过
  // onClaim 立即完成入场，让用户能在打开动画未结束时就把照片甩走，更贴近原生。
  const dismissEnabled =
    isMobile && isViewerContentVisible && !showExifPanel && !isImageZoomed;

  const { contentY, contentScale, chromeOpacity, revealOpacity } =
    useDismissGesture({
      enabled: dismissEnabled,
      targetRef: mediaRef,
      swiperRef,
      isImageZoomed,
      onDismiss: handleDismiss,
      onClaim: handleEntryAnimationComplete,
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
      resetBlobSource();
    }
  }, [isOpen, closeExifPanel, resetBlobSource]);

  const handleIndexSynced = useCallback(() => setIsImageZoomed(false), []);
  useSwiperIndexSync({
    currentIndex,
    onIndexSynced: handleIndexSynced,
    swiper: swiperRef,
  });
  useSwiperZoomLock({ isImageZoomed, swiper: swiperRef });

  const loadingIndicatorRef = useRef<LoadingIndicatorRef>(null);
  // 处理图片缩放状态变化
  const handleZoomChange = useCallback((isZoomed: boolean) => {
    setIsImageZoomed(isZoomed);
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

  const handleTagClick = useCallback((tag: string) => {
    window.open(
      `/${buildSingleTagFilterSearch(tag)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, []);

  usePhotoViewerKeyboard({
    isOpen,
    onClose,
    onNext: handleNext,
    onPrevious: handlePrevious,
  });

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
            className="fixed inset-0"
          >
            <m.div
              className="bg-material-opaque size-full"
              style={{ opacity: revealOpacity }}
            />
          </m.div>
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
            <m.div className="size-full" style={{ opacity: revealOpacity }}>
              {currentThumbHash && (
                <Thumbhash
                  thumbHash={currentThumbHash}
                  className="size-fill scale-110"
                />
              )}
            </m.div>
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
              // 入场动画期间也允许触摸，以便下滑关闭手势能中断入场（见 useDismissGesture）
              pointerEvents: !isViewerContentVisible ? "none" : "auto",
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
                <m.div style={{ opacity: chromeOpacity }}>
                  <PhotoViewerToolbar
                    currentPhoto={currentPhoto}
                    currentBlobSrc={currentBlobSrc}
                    isMobile={isMobile}
                    isVisible={isViewerContentVisible}
                    showExifPanel={showExifPanel}
                    onToggleExifPanel={toggleExifPanel}
                    onClose={onClose}
                  />
                </m.div>
                <PhotoViewerMediaCarousel
                  ref={mediaRef}
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
                  contentY={contentY}
                  contentScale={contentScale}
                  onSwiperReady={handleSwiperReady}
                  onSlideChange={handleSlideChange}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  onZoomChange={handleZoomChange}
                  onBlobSrcChange={handleBlobSrcChange}
                />

                <m.div className="shrink-0" style={{ opacity: chromeOpacity }}>
                  <Suspense>
                    <GalleryThumbnail
                      currentIndex={currentIndex}
                      photos={photos}
                      onIndexChange={onIndexChange}
                      visible={isViewerContentVisible}
                    />
                  </Suspense>
                </m.div>
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
                      onTagClick={handleTagClick}
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
