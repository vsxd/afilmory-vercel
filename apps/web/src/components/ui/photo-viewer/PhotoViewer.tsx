import "./PhotoViewer.css";
// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";

import { Spring, Thumbhash } from "@afilmory/ui";
import { AnimatePresence, m } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { Swiper as SwiperType } from "swiper";

import { useDialogFocusManagement } from "~/hooks/useDialogFocusManagement";
import { useExifPanel } from "~/hooks/useExifPanel";
import { useMobile } from "~/hooks/useMobile";
import { usePhotoNavigation } from "~/hooks/usePhotoNavigation";
import type { PhotoManifest } from "~/types/photo";

import { PhotoViewerTransitionPreview } from "./animations/PhotoViewerTransitionPreview";
import { usePhotoViewerTransitions } from "./animations/usePhotoViewerTransitions";
import { getGalleryThumbnailStripHeight } from "./gallery-thumbnail-metrics";
import type { LoadingIndicatorRef } from "./LoadingIndicator";
import {
  usePhotoViewerBlobSource,
  usePhotoViewerKeyboard,
  useSwiperIndexSync,
  useSwiperZoomLock,
} from "./PhotoViewerController";
import { PhotoViewerMediaCarousel } from "./PhotoViewerMediaCarousel";
import { PhotoViewerToolbar } from "./PhotoViewerToolbar";
import type { DismissSeed, DismissTransform } from "./useDismissGesture";
import { useDismissGesture } from "./useDismissGesture";

// 真实的代码分割：ExifPanel 拖着 ~660 行的 ExifPanelSections + formatExifData，
// GalleryThumbnail 也不在打开查看器的关键路径上——都按需加载，主 chunk 只留壳。
// （barrel index.ts 也刻意不再静态 re-export 这两个模块，否则会被拉回主 chunk。）
const ExifPanel = lazy(() =>
  import("./ExifPanel").then((module) => ({ default: module.ExifPanel })),
);
const GalleryThumbnail = lazy(() =>
  import("./GalleryThumbnail").then((module) => ({
    default: module.GalleryThumbnail,
  })),
);

interface PhotoViewerProps {
  photos: readonly PhotoManifest[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  onIndexChange: (index: number) => void;
  triggerElement: HTMLElement | null;
}

export const PhotoViewer = ({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onExitComplete,
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
  const entryFlipRef = useRef<HTMLDivElement>(null);

  const completeExit = useCallback(() => {
    onExitComplete?.();
    // The exit animation keeps the gallery target visibility:hidden until it
    // completes. Restore focus only after both that and modal isolation end.
    requestAnimationFrame(() => {
      if (triggerElement?.isConnected && !triggerElement.closest("[inert]")) {
        triggerElement.focus({ preventScroll: true });
      }
    });
  }, [onExitComplete, triggerElement]);

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
    onExitComplete: completeExit,
  });

  const handleDismiss = useCallback(
    (transform: DismissTransform) => {
      dismissTransformRef.current = transform;
      onClose();
    },
    [onClose],
  );

  // 认领下滑手势的那一刻：若入场动画仍在进行，完成入场并把入场 FLIP 当前所在的矩形
  // 作为“种子”返回——wrapper 据此原地接管，实现零跳变（entryTransition.to 即查看器
  // 取景框；[data-variant=…entry] 元素的实时 rect 即照片当前位置/大小）。
  const handleDismissClaim = useCallback((): DismissSeed | undefined => {
    const entry = entryTransition;
    if (!entry) return undefined;
    const f = entryFlipRef.current?.getBoundingClientRect();
    handleEntryAnimationComplete();
    if (!f || !f.width || !f.height || !entry.to.width || !entry.to.height) {
      return undefined;
    }
    const { to } = entry;
    return {
      x: f.left + f.width / 2 - (to.left + to.width / 2),
      y: f.top + f.height / 2 - (to.top + to.height / 2),
      scale: f.width / to.width,
    };
  }, [entryTransition, handleEntryAnimationComplete]);

  // 全平台启用（触摸 + 桌面鼠标，见 useDismissGesture）；入场动画期间也允许——认领时通过
  // onClaim 中断入场并原地接管，让用户能在打开动画未结束时就把照片甩走，且无跳变。
  const dismissEnabled =
    isViewerContentVisible && !showExifPanel && !isImageZoomed;

  const { contentX, contentY, contentScale, chromeOpacity, revealOpacity } =
    useDismissGesture({
      enabled: dismissEnabled,
      targetRef: mediaRef,
      swiperRef,
      isImageZoomed,
      onDismiss: handleDismiss,
      onClaim: handleDismissClaim,
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

  usePhotoViewerKeyboard({
    isOpen,
    onClose,
    onNext: handleNext,
    onPrevious: handlePrevious,
  });

  useDialogFocusManagement({
    dialogRef: containerRef,
    initialFocusSelector: "[data-photo-viewer-close]",
    isOpen,
    restoreFocusOnClose: false,
    returnFocusElement: triggerElement,
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
      {/* 交叉溶解的 Thumbhash 背景 */}
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
                  isViewerContentVisible={isViewerContentVisible}
                  isEntryAnimating={isEntryAnimating}
                  canGoPrevious={canGoPrevious}
                  canGoNext={canGoNext}
                  loadingIndicatorRef={loadingIndicatorRef}
                  contentX={contentX}
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
                  <Suspense
                    fallback={
                      // 占住缩略图条的高度（结构镜像其 border-t + 内容 + pb-safe），
                      // chunk 到达时媒体区不跳、入场 FLIP 目标矩形不失真。
                      <div className="pb-safe border-t border-transparent">
                        <div
                          style={{
                            height: getGalleryThumbnailStripHeight(isMobile),
                          }}
                        />
                      </div>
                    }
                  >
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

              <Suspense
                // 桌面端 fallback 占住侧栏宽度（面板本体是 w-80 shrink-0），chunk
                // 到达时取景框不重排；移动端面板是按需弹出的覆盖层，无需占位。
                fallback={isMobile ? null : <div className="w-80 shrink-0" />}
              >
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
          ref={entryFlipRef}
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
