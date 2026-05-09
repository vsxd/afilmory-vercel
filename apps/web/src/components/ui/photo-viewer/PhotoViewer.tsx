import './PhotoViewer.css'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/navigation'

import { clsxm, Spring, Thumbhash } from '@afilmory/ui'
import { AnimatePresence, m } from 'motion/react'
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Swiper as SwiperType } from 'swiper'
import { Navigation, Virtual } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'

import { useExifPanel } from '~/hooks/useExifPanel'
import { useMobile } from '~/hooks/useMobile'
import { usePhotoNavigation } from '~/hooks/usePhotoNavigation'
import type { PhotoManifest } from '~/types/photo'

import { PhotoViewerTransitionPreview } from './animations/PhotoViewerTransitionPreview'
import { usePhotoViewerTransitions } from './animations/usePhotoViewerTransitions'
import { ExifPanel } from './ExifPanel'
import { GalleryThumbnail } from './GalleryThumbnail'
import type { LoadingIndicatorRef } from './LoadingIndicator'
import { LoadingIndicator } from './LoadingIndicator'
import { ProgressiveImage } from './ProgressiveImage'
import { SharePanel } from './SharePanel'

const viewerToolbarButtonClassName =
  'bg-material-ultra-thick pointer-events-auto flex size-10 items-center justify-center rounded-full text-white shadow-lg shadow-black/20 backdrop-blur-xl transition-[background-color,box-shadow,color,transform] duration-200 hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40'

const viewerNavButtonClassName =
  'bg-material-medium absolute top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 shadow-lg shadow-black/20 backdrop-blur-xl transition-[background-color,box-shadow,opacity,transform] duration-200 group-hover:opacity-100 hover:bg-black/40 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40'

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false

  if (target.isContentEditable) return true

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

const hasNestedKeyboardOverlay = (): boolean => {
  return document.querySelector('[data-photo-viewer-nested-overlay]') !== null
}

interface PhotoViewerProps {
  photos: PhotoManifest[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
  triggerElement: HTMLElement | null
}

export const PhotoViewer = ({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
  triggerElement,
}: PhotoViewerProps) => {
  const { t } = useTranslation()
  const swiperRef = useRef<SwiperType | null>(null)
  const [isImageZoomed, setIsImageZoomed] = useState(false)
  const { showExifPanel, toggleExifPanel, closeExifPanel } = useExifPanel()
  const [currentBlobSrc, setCurrentBlobSrc] = useState<string | null>(null)

  const isMobile = useMobile()
  const currentPhoto = photos[currentIndex]

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
  })

  const { handlePrevious, handleNext, canGoPrevious, canGoNext } = usePhotoNavigation({
    currentIndex,
    totalPhotos: photos.length,
    onIndexChange,
    swiperRef: swiperRef as React.RefObject<any>,
  })

  useEffect(() => {
    if (!isOpen) {
      setIsImageZoomed(false)
      closeExifPanel()
      setCurrentBlobSrc(null)
    }
  }, [isOpen, closeExifPanel])

  // 同步 Swiper 的索引
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentIndex) {
      swiperRef.current.slideTo(currentIndex, 300)
    }
    // 切换图片时重置缩放状态
    setIsImageZoomed(false)
  }, [currentIndex])

  // 当图片缩放状态改变时，控制 Swiper 的触摸行为
  useEffect(() => {
    if (swiperRef.current) {
      if (isImageZoomed) {
        // 图片被缩放时，禁用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = false
      } else {
        // 图片未缩放时，启用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = true
      }
    }
  }, [isImageZoomed])

  const loadingIndicatorRef = useRef<LoadingIndicatorRef>(null)
  // 处理图片缩放状态变化
  const handleZoomChange = useCallback((isZoomed: boolean) => {
    setIsImageZoomed(isZoomed)
  }, [])

  // 处理 blobSrc 变化
  const handleBlobSrcChange = useCallback((blobSrc: string | null) => {
    setCurrentBlobSrc(blobSrc)
  }, [])

  const handleSwiperReady = useCallback(
    (swiper: SwiperType) => {
      swiperRef.current = swiper
      // 初始化时确保触摸滑动是启用的
      swiper.allowTouchMove = !isImageZoomed
    },
    [isImageZoomed],
  )

  const handleSlideChange = useCallback(
    (swiper: SwiperType) => {
      onIndexChange(swiper.activeIndex)
    },
    [onIndexChange],
  )

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditableKeyboardTarget(event.target)) {
        return
      }

      if (hasNestedKeyboardOverlay()) {
        return
      }

      switch (event.key) {
        case 'ArrowLeft': {
          event.preventDefault()
          handlePrevious()
          break
        }
        case 'ArrowRight': {
          event.preventDefault()
          handleNext()
          break
        }
        case 'Escape': {
          event.preventDefault()
          onClose()
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handlePrevious, handleNext, onClose])

  if (!currentPhoto) return null

  const currentThumbHash = transitionThumbHash

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
            {currentThumbHash && <Thumbhash thumbHash={currentThumbHash} className="size-fill scale-110" />}
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
            aria-label={t('photo.viewer.label')}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
              touchAction: isMobile ? 'manipulation' : 'none',
              pointerEvents: !isViewerContentVisible || isEntryAnimating ? 'none' : 'auto',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
          >
            <div className={`flex size-full ${isMobile ? 'flex-col' : 'flex-row'}`}>
              <div className="z-1 flex min-h-0 min-w-0 flex-1 flex-col">
                <m.div
                  className="group relative flex min-h-0 min-w-0 flex-1"
                  animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
                  transition={Spring.presets.snappy}
                >
                  {/* 顶部工具栏 */}
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
                    exit={{ opacity: 0 }}
                    transition={Spring.presets.snappy}
                    className={`pointer-events-none absolute ${isMobile ? 'top-2 right-2 left-2' : 'top-4 right-4 left-4'} z-30 flex items-center justify-between`}
                  >
                    {/* 左侧工具按钮 */}
                    <div className="flex items-center gap-2">
                      {/* 信息按钮 - 在移动设备上显示 */}
                      {isMobile && (
                        <button
                          type="button"
                          aria-label={t('photo.viewer.info')}
                          aria-pressed={showExifPanel}
                          title={t('photo.viewer.info')}
                          className={clsxm(
                            viewerToolbarButtonClassName,
                            showExifPanel && 'bg-accent hover:bg-accent/90',
                          )}
                          onClick={toggleExifPanel}
                        >
                          <i className="i-mingcute-information-line" />
                        </button>
                      )}
                    </div>

                    {/* 右侧按钮组 */}
                    <div className="flex items-center gap-2">
                      {/* 分享按钮 */}
                      <SharePanel
                        photo={currentPhoto}
                        blobSrc={currentBlobSrc || undefined}
                        trigger={
                          <button
                            type="button"
                            className={viewerToolbarButtonClassName}
                            aria-label={t('photo.share.title')}
                            title={t('photo.share.title')}
                          >
                            <i className="i-mingcute-share-2-line" />
                          </button>
                        }
                      />

                      {/* 关闭按钮 */}
                      <button
                        type="button"
                        aria-label={t('common.close')}
                        title={t('common.close')}
                        className={viewerToolbarButtonClassName}
                        onClick={onClose}
                      >
                        <i className="i-mingcute-close-line" />
                      </button>
                    </div>
                  </m.div>

                  {/* 加载指示器 */}
                  <LoadingIndicator ref={loadingIndicatorRef} />
                  {/* Swiper 容器 */}
                  <Swiper
                    modules={[Navigation, Virtual]}
                    spaceBetween={0}
                    slidesPerView={1}
                    initialSlide={currentIndex}
                    virtual
                    onSwiper={handleSwiperReady}
                    onSlideChange={handleSlideChange}
                    className="h-full w-full"
                    style={{ touchAction: isMobile ? 'pan-x' : 'pan-y' }}
                  >
                    {photos.map((photo, index) => {
                      const isCurrentImage = index === currentIndex
                      const hideCurrentImage = isEntryAnimating && isCurrentImage
                      return (
                        <SwiperSlide key={photo.id} className="flex items-center justify-center" virtualIndex={index}>
                          <m.div
                            initial={{ opacity: 0.5, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={Spring.presets.smooth}
                            className="relative flex h-full w-full items-center justify-center"
                            style={{
                              visibility: hideCurrentImage ? 'hidden' : 'visible',
                            }}
                          >
                            <ProgressiveImage
                              loadingIndicatorRef={loadingIndicatorRef}
                              isCurrentImage={isCurrentImage}
                              src={photo.originalUrl}
                              thumbnailSrc={photo.thumbnailUrl}
                              alt={photo.title}
                              width={isCurrentImage ? currentPhoto.width : undefined}
                              height={isCurrentImage ? currentPhoto.height : undefined}
                              className="h-full w-full object-contain"
                              enablePan={isCurrentImage ? !isMobile || isImageZoomed : true}
                              enableZoom={true}
                              shouldRenderHighRes={isViewerContentVisible && isOpen}
                              onZoomChange={isCurrentImage ? handleZoomChange : undefined}
                              onBlobSrcChange={isCurrentImage ? handleBlobSrcChange : undefined}
                              // Video source (Live Photo or Motion Photo)
                              videoSource={
                                photo.video?.type === 'motion-photo'
                                  ? {
                                      type: 'motion-photo',
                                      imageUrl: photo.originalUrl,
                                      offset: photo.video.offset,
                                      size: photo.video.size,
                                      presentationTimestamp: photo.video.presentationTimestamp,
                                    }
                                  : photo.video?.type === 'live-photo'
                                    ? {
                                        type: 'live-photo',
                                        videoUrl: photo.video.videoUrl,
                                      }
                                    : { type: 'none' }
                              }
                              shouldAutoPlayVideoOnce={isCurrentImage}
                              // HDR props
                              isHDR={photo.isHDR}
                            />
                          </m.div>
                        </SwiperSlide>
                      )
                    })}
                  </Swiper>

                  {/* 自定义导航按钮 */}

                  {!isMobile && (
                    <Fragment>
                      {canGoPrevious && (
                        <button
                          type="button"
                          aria-label={t('photo.viewer.previous')}
                          title={t('photo.viewer.previous')}
                          className={`${viewerNavButtonClassName} left-4`}
                          onClick={handlePrevious}
                        >
                          <i className={`i-mingcute-left-line text-xl`} />
                        </button>
                      )}

                      {canGoNext && (
                        <button
                          type="button"
                          aria-label={t('photo.viewer.next')}
                          title={t('photo.viewer.next')}
                          className={`${viewerNavButtonClassName} right-4`}
                          onClick={handleNext}
                        >
                          <i className={`i-mingcute-right-line text-xl`} />
                        </button>
                      )}
                    </Fragment>
                  )}
                </m.div>

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
  )
}

const AnimatePresenceOnlyMobile = ({ children }: { children: React.ReactNode }) => {
  const isMobile = useMobile()
  if (!isMobile) return children
  return <AnimatePresence>{children}</AnimatePresence>
}
