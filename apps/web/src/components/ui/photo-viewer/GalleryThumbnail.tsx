import { clsxm, Spring } from "@afilmory/ui";
import { m } from "motion/react";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";
import { useMobile } from "~/hooks/useMobile";
import { nextFrame } from "~/lib/dom";
import type { PhotoManifest } from "~/types/photo";

const thumbnailSize = {
  mobile: 48,
  desktop: 64,
};

const thumbnailGapSize = {
  mobile: 8,
  desktop: 12,
};

const thumbnailPaddingSize = {
  mobile: 12,
  desktop: 16,
};

export const GalleryThumbnail: FC<{
  currentIndex: number;
  photos: PhotoManifest[];
  onIndexChange: (index: number) => void;
  visible?: boolean;
}> = ({ currentIndex, photos, onIndexChange, visible = true }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const isMobile = useMobile();

  const [scrollContainerWidth, setScrollContainerWidth] = useState(0);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      setScrollContainerWidth(scrollContainer.clientWidth);
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setScrollContainerWidth((prev) =>
            prev === entry.contentRect.width ? prev : entry.contentRect.width,
          );
        }
      });
      observer.observe(scrollContainer);
      return () => {
        observer.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer) {
      const containerWidth = scrollContainerWidth;
      const thumbnailLeft =
        currentIndex *
          (isMobile ? thumbnailSize.mobile : thumbnailSize.desktop) +
        (isMobile ? thumbnailGapSize.mobile : thumbnailGapSize.desktop) *
          currentIndex;
      const thumbnailWidth = isMobile
        ? thumbnailSize.mobile
        : thumbnailSize.desktop;

      const scrollLeft =
        thumbnailLeft - containerWidth / 2 + thumbnailWidth / 2;
      nextFrame(() => {
        scrollContainer.scrollTo({
          left: scrollLeft,
          behavior: "auto",
        });
      });
    }
  }, [currentIndex, isMobile, scrollContainerWidth]);

  // 处理鼠标滚轮事件，映射为横向滚动
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleWheel = (e: WheelEvent) => {
      // 阻止默认的垂直滚动
      e.preventDefault();

      // 优先使用触控板的横向滚动 (deltaX)
      // 如果没有横向滚动，则将垂直滚动 (deltaY) 转换为横向滚动
      const scrollAmount =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scrollContainer.scrollLeft += scrollAmount;
    };

    scrollContainer.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const thumbnailWidth = isMobile
    ? thumbnailSize.mobile
    : thumbnailSize.desktop;
  const gapSize = isMobile ? thumbnailGapSize.mobile : thumbnailGapSize.desktop;
  const itemWidth = thumbnailWidth + gapSize;
  const visibleThumbnailCount =
    scrollContainerWidth > 0 ? Math.ceil(scrollContainerWidth / itemWidth) : 8;
  const renderRange = Math.max(8, Math.ceil(visibleThumbnailCount / 2) + 6);
  const startIndex = Math.max(0, currentIndex - renderRange);
  const endIndex = Math.min(photos.length - 1, currentIndex + renderRange);

  const leftPlaceholderWidth = startIndex > 0 ? startIndex * itemWidth : 0;
  const rightPlaceholderWidth =
    endIndex < photos.length - 1
      ? (photos.length - 1 - endIndex) * itemWidth
      : 0;

  return (
    <m.div
      className="pb-safe border-accent/20 bg-material-medium z-10 shrink-0 border-t backdrop-blur-2xl"
      initial={{ y: 100, opacity: 0 }}
      animate={{
        y: visible ? 0 : 48,
        opacity: visible ? 1 : 0,
      }}
      exit={{ y: 100, opacity: 0 }}
      transition={Spring.presets.smooth}
      style={{
        pointerEvents: visible ? "auto" : "none",
        boxShadow:
          "0 -8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 -4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 -2px 8px rgba(0, 0, 0, 0.1)",
      }}
    >
      {/* Inner glow layer */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent)",
        }}
      />
      <div
        ref={scrollContainerRef}
        className="scrollbar-none relative z-10 flex overflow-x-auto"
        style={{
          gap: isMobile ? thumbnailGapSize.mobile : thumbnailGapSize.desktop,
          padding: isMobile
            ? thumbnailPaddingSize.mobile
            : thumbnailPaddingSize.desktop,
        }}
      >
        {/* Left placeholder */}
        {leftPlaceholderWidth > 0 && (
          <div
            style={{
              width: leftPlaceholderWidth,
              flexShrink: 0,
            }}
          />
        )}

        {/* Only render thumbnails within visible range */}
        {photos.slice(startIndex, endIndex + 1).map((photo, sliceIndex) => {
          const index = startIndex + sliceIndex;
          return (
            <button
              type="button"
              key={photo.id}
              className={clsxm(
                // 不用 content-visibility:auto：条目已按 currentIndex 窗口化渲染，
                // 该属性只会让离屏缩略图被丢弃渲染、横向滚回时重新解码重绘（观感即
                // 「缓存的小图又在加载」）。
                "focus-visible:ring-accent/45 focus-visible:ring-offset-background relative shrink-0 overflow-hidden rounded-lg border-2 transition-[border-color,box-shadow,filter,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-offset-2",
                index === currentIndex
                  ? "border-accent opacity-100 shadow-[0_0_20px_color-mix(in_srgb,var(--color-accent)_22%,transparent)] ring-2 ring-accent/40"
                  : "grayscale-50 border-white/15 opacity-75 hover:border-accent/70 hover:opacity-100 hover:grayscale-0",
              )}
              style={
                isMobile
                  ? {
                      width: thumbnailSize.mobile,
                      height: thumbnailSize.mobile,
                    }
                  : {
                      width: thumbnailSize.desktop,
                      height: thumbnailSize.desktop,
                    }
              }
              aria-current={index === currentIndex ? "true" : undefined}
              aria-label={t("photo.thumbnail.open", {
                title: photo.title || photo.id,
              })}
              title={photo.title || photo.id}
              onClick={() => onIndexChange(index)}
            >
              <ThumbnailImage
                photoId={photo.id}
                src={photo.thumbnailUrl}
                alt={photo.title || photo.id}
                thumbHash={photo.thumbHash}
                loading={index === currentIndex ? "eager" : "lazy"}
                fetchPriority={index === currentIndex ? "high" : "low"}
                decoding="async"
                draggable={false}
                containerClassName="absolute inset-0"
                imageClassName="h-full w-full object-cover"
                placeholderClassName="size-fill"
              />
            </button>
          );
        })}

        {/* Right placeholder */}
        {rightPlaceholderWidth > 0 && (
          <div
            style={{
              width: rightPlaceholderWidth,
              flexShrink: 0,
            }}
          />
        )}
      </div>
    </m.div>
  );
};
