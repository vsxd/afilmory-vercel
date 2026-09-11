import clsx from "clsx";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";
import { useLivePhotoHandler } from "~/hooks/useLivePhotoHandler";
import { useContextPhotos } from "~/hooks/usePhotoViewer";
import {
  CarbonIsoOutline,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens as LensIcon,
  TablerAperture,
} from "~/icons";
import { isMobileDevice } from "~/lib/device-viewport";
import { getEssentialExif } from "~/lib/essential-exif";
import { getImageFormat } from "~/lib/image-utils";
import { getPhotoAccessibleLabel } from "~/lib/photo-accessibility";
import { flushStartupMetrics, markStartupOnce } from "~/lib/startup-metrics";
import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
} from "~/lib/thumbnail-load-cache";
import { useAppNavigation } from "~/navigation/hooks";
import type { PhotoManifest } from "~/types/photo";

import { computeMasonryItemHeight } from "./gallery-layout";

export const MasonryPhotoItem = memo(
  ({
    data,
    width,
    index,
    tabIndex = -1,
    onFocus,
  }: {
    data: PhotoManifest;
    width: number;
    index: number;
    tabIndex?: number;
    onFocus?: (index: number) => void;
  }) => {
    const photos = useContextPhotos();
    const navigation = useAppNavigation();
    const { t, i18n } = useTranslation();
    const [imageError, setImageError] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const imageRef = useRef<HTMLImageElement>(null);
    const thumbnailCacheKey = getThumbnailLoadCacheKey(
      data.id,
      data.thumbnailUrl,
    );
    const hasLoadedThumbnailBefore = hasLoadedThumbnail(thumbnailCacheKey);
    const [imageLoaded, setImageLoaded] = useState(hasLoadedThumbnailBefore);

    const {
      videoRef,
      hasVideo,
      isPlayingLivePhoto,
      isConvertingVideo,
      videoConversionError,
      handleMouseEnter,
      handleMouseLeave,
      handleVideoEnded,
    } = useLivePhotoHandler({ data, imageLoaded });

    useEffect(() => {
      setImageLoaded(hasLoadedThumbnail(thumbnailCacheKey));
      setImageError(false);
    }, [thumbnailCacheKey]);

    const handleImageLoad = () => {
      if (markStartupOnce("first-thumbnail-loaded", { photoId: data.id })) {
        flushStartupMetrics("first-thumbnail-loaded");
      }
    };

    const handleImageError = () => {
      setImageError(true);
    };

    const handleClick = useCallback(() => {
      navigation.openPhoto(data.id, {
        photoIds: photos.map((photo) => photo.id),
      });
    }, [data.id, navigation, photos]);

    const photoHref = navigation.photoHref(data.id);
    const handleLinkClick = useCallback(
      (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        handleClick();
      },
      [handleClick],
    );

    // 原生 <a> 只在 Enter 激活；这里曾是 role="button"（Enter+Space 都激活），
    // 改回锚点后 Space 会变成滚动页面。补回 Space 激活并走 currentTarget.click()
    // 复用同一条点击路径；带修饰键时不拦截，保留原生行为。
    const handleLinkKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLAnchorElement>) => {
        if (
          event.key !== " " ||
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        event.currentTarget.click();
      },
      [],
    );

    // onFocus 契约：回调自身身份稳定（由 MasonryRoot 提供单个 useCallback），
    // 格子把自己的 index 传回去 —— 滚动热路径上 memo 不因新箭头函数失效。
    const handleFocus = useCallback(() => {
      setIsFocused(true);
      onFocus?.(index);
    }, [index, onFocus]);

    // 与虚拟布局同一个整数高度函数（守卫 aspectRatio 异常 + 整数几何，见 gallery-layout.ts），
    // 保证格子壳与照片内容逐像素一致、无小数 y 坐标（iOS 分块光栅化 hairline 的根源）。
    const calculatedHeight = computeMasonryItemHeight(width, data);

    // 核心 EXIF 拍摄参数：与查看器面板共用同一份格式化逻辑（essential-exif.ts）。
    // 覆盖层只有一格焦距，无 35mm 等效值时回退实际焦距。
    const essentialExif = getEssentialExif(data.exif);
    const exifData = {
      ...essentialExif,
      focalLength35mm:
        essentialExif.focalLength35mm ?? essentialExif.focalLength,
    };
    const shouldShowImageDetails = imageLoaded || hasLoadedThumbnailBefore;

    // 使用通用的图片格式提取函数
    const imageFormat = getImageFormat(data.originalUrl || data.s3Key || "");

    // 首屏首几张缩略图是 LCP 候选：立即加载并提高优先级，消除 LCP 的发现/加载延迟；
    // 其余照片懒加载、低优先级，避免与首屏关键资源争抢带宽。
    const isPriorityThumbnail = index < 4;
    // 曾加载过的图重挂载（虚拟列表滚回）必然命中缓存：eager 跳过浏览器的
    // lazy-load 观察/延迟决策，让缓存图尽快上屏，缩短重挂载的空窗。
    const shouldLoadEagerly = isPriorityThumbnail || hasLoadedThumbnailBefore;

    // 标题和描述都缺失时，aria-label 不能是 undefined —— 那会让整格照片对
    // 读屏器变成一个无名按钮；回退到"摄于某日的照片"，日期无效再退到通用文案。
    const ariaLabel = getPhotoAccessibleLabel(data, t, i18n.language);

    return (
      // The native link needs a block box: its media and error states are
      // absolutely positioned and cannot give an inline anchor any dimensions.
      // Entry animation belongs to MasonryRoot's wrapper.
      <a
        href={photoHref}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        // Keep the shared outline inside the clipped cell, above neighbouring photos.
        className="bg-fill-quaternary group relative block w-full cursor-pointer scroll-mt-24 scroll-mb-28 overflow-hidden focus-visible:z-30 lg:scroll-mb-4"
        style={{
          width,
          height: calculatedHeight,
          outlineOffset: -3,
        }}
        data-photo-id={data.id}
        data-gallery-photo-link
        data-gallery-photo-index={index}
        onClick={handleLinkClick}
        onKeyDown={handleLinkKeyDown}
        onFocus={handleFocus}
        onBlur={() => setIsFocused(false)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Thumbhash 占位符 */}
        {!imageError && (
          <ThumbnailImage
            ref={imageRef}
            photoId={data.id}
            src={data.thumbnailUrl}
            alt={ariaLabel}
            width={data.width}
            height={data.height}
            thumbHash={data.thumbHash}
            loading={shouldLoadEagerly ? "eager" : "lazy"}
            fetchPriority={isPriorityThumbnail ? "high" : "low"}
            containerClassName="absolute inset-0"
            imageClassName={clsx(
              "h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025] motion-reduce:transition-none",
            )}
            placeholderClassName="h-full w-full"
            onLoad={handleImageLoad}
            onError={handleImageError}
            onLoadStateChange={setImageLoaded}
          />
        )}

        {/* Live Photo/Motion Photo 视频 */}
        {hasVideo && (
          <video
            ref={videoRef}
            className={clsx(
              "absolute inset-0 h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025] motion-reduce:transition-none",
              isPlayingLivePhoto ? "z-10" : "pointer-events-none opacity-0",
            )}
            muted
            playsInline
            onEnded={handleVideoEnded}
          />
        )}

        {/* 错误状态 */}
        {imageError && (
          <div className="bg-fill-quaternary text-text-tertiary absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <i
                className="i-mingcute-image-line text-2xl"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm">{t("photo.error.loading")}</p>
            </div>
          </div>
        )}

        {/* Live Photo/Motion Photo 标识 */}
        {hasVideo && (
          <div
            className={clsx(
              "af-glass absolute z-20 flex items-center space-x-1 rounded-lg px-1 py-1 text-xs text-white",
              "top-2 left-2",
              "flex-wrap gap-y-1",
            )}
            title={
              isMobileDevice
                ? t("photo.live.tooltip.mobile.main")
                : t("photo.live.tooltip.desktop.main")
            }
          >
            {isConvertingVideo ? (
              <div className="flex items-center gap-1 px-1">
                <i
                  className="i-mingcute-loading-line animate-spin"
                  aria-hidden="true"
                />
                <span>{t("loading.converting")}</span>
              </div>
            ) : (
              <Fragment>
                <i
                  className="i-mingcute-live-photo-line size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="mr-1 shrink-0">{t("photo.live.badge")}</span>
                {videoConversionError ? (
                  <span className={"bg-warning/20 ml-0.5 rounded px-1 text-xs"}>
                    <span
                      className="text-yellow w-3 text-center font-bold"
                      title={(videoConversionError as Error).message}
                    >
                      !
                    </span>
                  </span>
                ) : null}
              </Fragment>
            )}
          </div>
        )}

        {/* Touch scrolling keeps lightweight cells. An attached keyboard can still
            reveal the same information by focusing a photo. */}
        {(!isMobileDevice || isFocused) && shouldShowImageDetails && (
          <div className="pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/15 to-transparent" />

            {/* Details use one shared reveal layer for hover and keyboard focus. */}
            <div className="absolute inset-x-0 bottom-0 px-3 pt-4 pb-3 text-white">
              {/* 基本信息和标签 section */}
              <div className="space-y-1.5">
                <h2 className="truncate text-sm leading-5 font-medium">
                  {data.title}
                </h2>
                {data.description && (
                  <p className="line-clamp-2 text-xs leading-4 text-white/85">
                    {data.description}
                  </p>
                )}

                {/* 基本信息 */}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-white/80 tabular-nums">
                  <span>{imageFormat}</span>
                  <span>•</span>
                  <span>
                    {data.width} × {data.height}
                  </span>
                  <span>•</span>
                  <span>{(data.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>

                {/* Tags */}
                {data.tags && data.tags.length > 0 && (
                  <div className="flex max-h-12 flex-wrap gap-1 overflow-hidden">
                    {data.tags.map((tag) => (
                      <span
                        key={tag}
                        className="max-w-full truncate rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] leading-4 text-white/90"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* EXIF 信息网格 */}
              {calculatedHeight >= 200 && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] leading-4 tabular-nums">
                  {exifData.focalLength35mm && (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <LensIcon
                        className="shrink-0 text-sm text-white/70"
                        aria-hidden="true"
                      />
                      <span className="text-white/90">
                        {exifData.focalLength35mm}mm
                      </span>
                    </div>
                  )}

                  {exifData.aperture && (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <TablerAperture
                        className="shrink-0 text-sm text-white/70"
                        aria-hidden="true"
                      />
                      <span className="text-white/90">{exifData.aperture}</span>
                    </div>
                  )}

                  {exifData.shutterSpeed && (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <MaterialSymbolsShutterSpeed
                        className="shrink-0 text-sm text-white/70"
                        aria-hidden="true"
                      />
                      <span className="text-white/90">
                        {exifData.shutterSpeed}
                      </span>
                    </div>
                  )}

                  {exifData.iso && (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <CarbonIsoOutline
                        className="shrink-0 text-sm text-white/70"
                        aria-hidden="true"
                      />
                      <span className="text-white/90">ISO {exifData.iso}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </a>
    );
  },
);
