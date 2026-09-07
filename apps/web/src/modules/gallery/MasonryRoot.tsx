import { clsxm, Spring, useScrollViewElement } from "@afilmory/ui";
import { useAtomValue } from "jotai";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { responsiveGalleryColumnsAtom } from "~/atoms/app";
import { DateRangeIndicator } from "~/components/ui/date-range-indicator";
import { useMobile } from "~/hooks/useMobile";
import { useContextPhotos } from "~/hooks/usePhotoViewer";
import { useVisiblePhotosDateRange } from "~/hooks/useVisiblePhotosDateRange";
import { setGalleryVirtualPhotoTargetResolver } from "~/lib/gallery-virtual-target";
import { useGalleryViewport } from "~/navigation/useGalleryViewport";
import type { PhotoManifest } from "~/types/photo";

import { ActionGroup } from "./ActionGroup";
import type { MasonryItemType } from "./gallery-layout";
import {
  calculateGalleryColumnWidth,
  computeMasonryItemHeight,
  createMasonryItems,
  estimatePhotoVirtualRect,
  getMasonryAnimationDelay,
  getMasonryItemKey,
  getPhotoSetKey,
  MasonryHeaderItem,
  shouldAnimateMasonryItem,
} from "./gallery-layout";
import { MasonryHeaderMasonryItem } from "./MasonryHeaderMasonryItem";
import { MasonryPhotoItem } from "./MasonryPhotoItem";
import type { MasonryRef } from "./VirtualMasonry";
import { Masonry } from "./VirtualMasonry";

const isPhotoItem = (
  item: MasonryItemType | undefined,
): item is PhotoManifest => Boolean(item && "id" in item);

export const MasonryRoot = () => {
  const columns = useAtomValue(responsiveGalleryColumnsAtom);
  const hasAnimatedRef = useRef(false);
  const [showFloatingActions, setShowFloatingActions] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion() === true;

  const photos = useContextPhotos();
  const isMobile = useMobile();
  const masonryRef = useRef<MasonryRef>(null);
  const photosKey = useMemo(() => getPhotoSetKey(photos), [photos]);
  const photoIndexById = useMemo(
    () => new Map(photos.map((photo, index) => [photo.id, index])),
    [photos],
  );
  const masonryItems = useMemo(
    () => createMasonryItems(photos, isMobile),
    [photos, isMobile],
  );

  const { dateRange, handleRender } = useVisiblePhotosDateRange();
  const scrollElement = useScrollViewElement();
  useGalleryViewport(scrollElement);

  const handleAnimationComplete = useCallback(() => {
    hasAnimatedRef.current = true;
  }, []);
  useEffect(() => {
    setActivePhotoId((current) =>
      current && photoIndexById.has(current)
        ? current
        : (photos[0]?.id ?? null),
    );
  }, [photoIndexById, photos]);

  // 身份稳定的聚焦回调（格子回传自己的 photoIndex）：VirtualMasonry 每个滚动帧
  // 都会重跑 render()，若在其中现造箭头函数，MasonryItem/MasonryPhotoItem 的
  // memo 会每帧失效，整棵照片子树跟着滚动重渲染。
  const handlePhotoFocus = useCallback(
    (photoIndex: number) => {
      const photo = photos[photoIndex];
      if (!photo) return;
      setActivePhotoId(photo.id);
      masonryRef.current?.pinIndex(isMobile ? photoIndex : photoIndex + 1);
    },
    [isMobile, photos],
  );

  const focusPhoto = useCallback(
    (photoIndex: number) => {
      const boundedIndex = Math.min(
        Math.max(photoIndex, 0),
        Math.max(photos.length - 1, 0),
      );
      const photo = photos[boundedIndex];
      if (!photo) return;
      setActivePhotoId(photo.id);
      masonryRef.current?.scrollToIndex(
        isMobile ? boundedIndex : boundedIndex + 1,
        { focus: true, align: "center" },
      );
    },
    [isMobile, photos],
  );

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-gallery-photo-index]",
      );
      if (!target) return;
      const currentIndex = Number(target.dataset.galleryPhotoIndex);
      if (!Number.isInteger(currentIndex)) return;

      const columnCount =
        masonryRef.current?.getLayoutMetrics()?.columnCount ?? 1;
      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowLeft": {
          nextIndex = currentIndex - 1;
          break;
        }
        case "ArrowRight": {
          nextIndex = currentIndex + 1;
          break;
        }
        case "ArrowUp": {
          nextIndex = currentIndex - columnCount;
          break;
        }
        case "ArrowDown": {
          nextIndex = currentIndex + columnCount;
          break;
        }
        case "Home": {
          nextIndex = 0;
          break;
        }
        case "End": {
          nextIndex = photos.length - 1;
          break;
        }
        default: {
          return;
        }
      }
      event.preventDefault();
      focusPhoto(nextIndex);
    },
    [focusPhoto, photos.length],
  );

  const handleMasonryRender = useCallback(
    (
      startIndex: number,
      stopIndex: number,
      items: MasonryItemType[],
      visibleIndices: number[],
    ) => {
      handleRender(startIndex, stopIndex, items, visibleIndices);
      setActivePhotoId((current) => {
        const currentIndex = current ? photoIndexById.get(current) : undefined;
        const currentMasonryIndex =
          currentIndex === undefined
            ? -1
            : isMobile
              ? currentIndex
              : currentIndex + 1;
        if (visibleIndices.includes(currentMasonryIndex)) return current;
        const firstVisiblePhoto = visibleIndices
          .map((index) => items[index])
          .find(isPhotoItem);
        return firstVisiblePhoto?.id ?? current;
      });
    },
    [handleRender, isMobile, photoIndexById],
  );

  // 目标列宽从 Masonry 实测的容器宽度推导（函数形式 prop）——不再监听
  // window resize：innerWidth 与容器实测是两个会失配的来源（padding/滚动条槽）。
  const columnWidth = useCallback(
    (measuredContainerWidth: number) =>
      calculateGalleryColumnWidth({
        columns,
        containerWidth: measuredContainerWidth,
        isMobile,
      }),
    [columns, isMobile],
  );

  // 监听滚动，控制浮动组件的显示
  useEffect(() => {
    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollTop } = scrollElement;
      setShowFloatingActions(scrollTop > 500);
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [scrollElement]);

  useEffect(() => {
    setGalleryVirtualPhotoTargetResolver((photoId) => {
      const photoIndex = photoIndexById.get(photoId);
      if (photoIndex === undefined) {
        return null;
      }

      const masonryItemIndex = isMobile ? photoIndex : photoIndex + 1;
      const rect = masonryRef.current?.getItemRect(masonryItemIndex);
      if (rect?.width && rect.height) {
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderRadius: 0,
        };
      }

      const metrics = masonryRef.current?.getLayoutMetrics();
      if (!metrics) {
        return null;
      }

      const headerRect = isMobile ? null : masonryRef.current?.getItemRect(0);
      return estimatePhotoVirtualRect({
        headerHeight: headerRect?.height ?? 0,
        isMobile,
        metrics,
        photoIndex,
        photos,
      });
    });

    return () => {
      setGalleryVirtualPhotoTargetResolver(null);
    };
  }, [isMobile, photoIndexById, photos]);

  return (
    <>
      {/* 桌面端：左右分布 */}
      {!isMobile && (
        <>
          <DateRangeIndicator
            dateRange={dateRange.formattedRange}
            isVisible={showFloatingActions && !!dateRange.formattedRange}
          />
          <FloatingActionBar showFloatingActions={showFloatingActions} />
        </>
      )}

      {/* 移动端：垂直堆叠 */}
      {isMobile && !!dateRange.formattedRange && (
        <div className="fixed top-0 right-0 left-0 z-50 pt-[env(safe-area-inset-top)]">
          {/* 移动端顶部指示器只显示时间，不显示照片地点 */}
          <DateRangeIndicator
            dateRange={dateRange.formattedRange}
            isVisible={showFloatingActions && !!dateRange.formattedRange}
            className="relative top-0 left-0"
          />
        </div>
      )}

      <div className="p-1 **:select-none! lg:px-0 lg:pb-0">
        {isMobile && <MasonryHeaderMasonryItem className="mb-1" />}
        <Masonry<MasonryItemType>
          key={`${isMobile ? "mobile" : "desktop"}:${photosKey}`}
          ref={masonryRef}
          items={masonryItems}
          render={useCallback(
            (props) => {
              const photo = isPhotoItem(props.data) ? props.data : null;
              const photoIndex = photo
                ? (photoIndexById.get(photo.id) ?? -1)
                : -1;
              return (
                <MasonryItem
                  {...props}
                  photoIndex={photoIndex}
                  isRovingTarget={photo?.id === activePhotoId}
                  hasAnimated={hasAnimatedRef.current}
                  shouldReduceMotion={shouldReduceMotion}
                  onFocus={handlePhotoFocus}
                  onAnimationComplete={handleAnimationComplete}
                />
              );
            },
            [
              activePhotoId,
              handleAnimationComplete,
              handlePhotoFocus,
              photoIndexById,
              shouldReduceMotion,
            ],
          )}
          onRender={handleMasonryRender}
          columnWidth={columnWidth}
          columnGutter={4}
          rowGutter={4}
          itemHeightEstimate={400}
          itemHeight={useCallback(
            (data: MasonryItemType, colWidth: number) =>
              data instanceof MasonryHeaderItem
                ? 0 // header 高度未知，交给虚拟列表 measure
                : computeMasonryItemHeight(colWidth, data),
            [],
          )}
          itemKey={useCallback(
            (data: MasonryItemType) => getMasonryItemKey(data),
            [],
          )}
          role="grid"
          aria-label={t("common.skip-to-gallery")}
          onKeyDown={handleGridKeyDown}
        />
      </div>
    </>
  );
};

export const MasonryItem = memo(
  ({
    data,
    width,
    index,
    photoIndex,
    isRovingTarget,
    onFocus,
    shouldReduceMotion,

    hasAnimated,
    onAnimationComplete,
  }: {
    data: MasonryItemType;
    width: number;
    index: number;
    photoIndex: number;
    isRovingTarget: boolean;
    onFocus: (photoIndex: number) => void;
    shouldReduceMotion: boolean;
    hasAnimated: boolean;
    onAnimationComplete: () => void;
  }) => {
    const itemKey = useMemo(() => getMasonryItemKey(data), [data]);
    const shouldAnimate =
      !shouldReduceMotion && shouldAnimateMasonryItem({ hasAnimated, index });
    const delay = getMasonryAnimationDelay({
      data,
      index,
      shouldAnimate,
    });

    // Framer Motion 动画变体
    const itemVariants = useMemo(
      () => ({
        // 入场动画刻意不用 filter: blur —— blur 滤镜动画对 GPU/合成极其昂贵，
        // 首屏前 30 个 item 同时跑会显著拖慢首屏渲染（render delay）并掉帧。
        // opacity + 位移 + 轻微缩放已足够呈现入场效果，且基本零合成成本。
        hidden: {
          opacity: 0,
          y: 30,
          scale: 0.95,
        },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            ...Spring.presets.smooth,
            delay,
          },
        },
      }),
      [delay],
    );

    if (data instanceof MasonryHeaderItem) {
      return <MasonryHeaderMasonryItem style={{ width }} key={itemKey} />;
    } else {
      return (
        <m.div
          key={itemKey}
          variants={shouldAnimate ? itemVariants : undefined}
          initial={shouldAnimate ? "hidden" : "visible"}
          animate="visible"
          onAnimationComplete={shouldAnimate ? onAnimationComplete : undefined}
        >
          <MasonryPhotoItem
            data={data}
            width={width}
            index={photoIndex}
            tabIndex={isRovingTarget ? 0 : -1}
            onFocus={onFocus}
          />
        </m.div>
      );
    }
  },
);

const FloatingActionBar = ({
  showFloatingActions,
}: {
  showFloatingActions: boolean;
}) => {
  const isMobile = useMobile();

  const variants = isMobile
    ? {
        initial: {
          opacity: 0,
        },
        animate: { opacity: 1 },
      }
    : {
        initial: {
          opacity: 0,
          x: 20,
          y: 0,
          scale: 0.95,
        },
        animate: { opacity: 1, x: 0, y: 0, scale: 1 },
      };
  return (
    <AnimatePresence>
      {showFloatingActions && (
        <m.div
          variants={variants}
          initial="initial"
          animate="animate"
          exit="initial"
          transition={Spring.presets.snappy}
          className={clsxm(
            "border-material-opaque rounded-xl border bg-black/60 p-3 shadow-xl backdrop-blur-2xl",
            isMobile
              ? "rounded-t-none rounded-br-none -translate-y-px"
              : "fixed top-4 right-4 z-50 lg:top-6 lg:right-6",
          )}
        >
          <ActionGroup />
        </m.div>
      )}
    </AnimatePresence>
  );
};
