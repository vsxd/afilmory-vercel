import type { PhotoManifest } from "~/types/photo";

import type { MasonryLayoutMetrics } from "./Masonic";

export class MasonryHeaderItem {
  static default = new MasonryHeaderItem();
}

export type MasonryItemType = PhotoManifest | MasonryHeaderItem;

export const FIRST_SCREEN_ITEMS_COUNT = 30;

/**
 * Resolve a safe, positive, finite aspect ratio for a photo. Falls back to the
 * width/height ratio, then to 1, so a missing/zero/NaN `aspectRatio` can never
 * produce an `Infinity`/`NaN` item height that corrupts the virtualized layout.
 */
export function resolveAspectRatio(photo: {
  aspectRatio?: number;
  width?: number;
  height?: number;
}): number {
  const raw =
    photo.aspectRatio ||
    (photo.height && photo.width ? photo.width / photo.height : 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

const COLUMN_WIDTH_CONFIG = {
  auto: {
    mobile: 150,
    desktop: 250,
    maxColumns: 8,
  },
  min: {
    mobile: 120,
    desktop: 200,
  },
  max: {
    mobile: 250,
    desktop: 500,
  },
};

export function getPhotoSetKey(photos: PhotoManifest[]): string {
  let hash = 2166136261;

  for (const photo of photos) {
    for (const char of photo.id) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 31;
    hash = Math.imul(hash, 16777619);
  }

  return `${photos.length}:${hash >>> 0}:${photos[0]?.id ?? ""}:${photos.at(-1)?.id ?? ""}`;
}

export function calculateGalleryColumnWidth({
  columns,
  containerWidth,
  isMobile,
}: {
  columns: number | "auto";
  containerWidth: number;
  isMobile: boolean;
}): number {
  const { auto, min, max } = COLUMN_WIDTH_CONFIG;
  const gutter = 4;
  const availableWidth = containerWidth - (isMobile ? 8 : 32);

  if (columns === "auto") {
    const autoWidth = isMobile ? auto.mobile : auto.desktop;
    if (!isMobile) {
      const colCount = Math.floor(
        (availableWidth + gutter) / (autoWidth + gutter),
      );

      if (colCount > auto.maxColumns) {
        return (
          (availableWidth - (auto.maxColumns - 1) * gutter) / auto.maxColumns
        );
      }
    }

    return autoWidth;
  }

  const calculatedWidth = (availableWidth - (columns - 1) * gutter) / columns;
  const minWidth = isMobile ? min.mobile : min.desktop;
  const maxWidth = isMobile ? max.mobile : max.desktop;

  return Math.max(Math.min(calculatedWidth, maxWidth), minWidth);
}

export function createMasonryItems(
  photos: PhotoManifest[],
  isMobile: boolean,
): MasonryItemType[] {
  return isMobile ? photos : [MasonryHeaderItem.default, ...photos];
}

export function getMasonryItemKey(data: MasonryItemType): string {
  if (data instanceof MasonryHeaderItem) {
    return "header";
  }
  return data.id;
}

export function shouldAnimateMasonryItem({
  hasAnimated,
  index,
}: {
  hasAnimated: boolean;
  index: number;
}): boolean {
  return !hasAnimated && index < FIRST_SCREEN_ITEMS_COUNT;
}

export function getMasonryAnimationDelay({
  data,
  index,
  shouldAnimate,
}: {
  data: MasonryItemType;
  index: number;
  shouldAnimate: boolean;
}): number {
  if (!shouldAnimate) return 0;
  return data instanceof MasonryHeaderItem ? 0 : Math.min(index * 0.05, 0.3);
}

const getShortestColumnIndex = (columnHeights: number[]) => {
  let shortestIndex = 0;
  let shortestHeight = columnHeights[0] ?? 0;

  for (let index = 1; index < columnHeights.length; index += 1) {
    const height = columnHeights[index] ?? 0;
    if (height < shortestHeight) {
      shortestIndex = index;
      shortestHeight = height;
    }
  }

  return shortestIndex;
};

export interface MasonryCellLayout {
  index: number;
  column: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MasonryGridLayout {
  cells: MasonryCellLayout[];
  totalHeight: number;
  columnCount: number;
}

/**
 * 根据容器宽度与列宽推导列数（与 calculateGalleryColumnWidth 配套）。
 */
export function resolveMasonryColumnCount({
  containerWidth,
  columnWidth,
  columnGutter,
}: {
  containerWidth: number;
  columnWidth: number;
  columnGutter: number;
}): number {
  if (containerWidth <= 0 || columnWidth <= 0) return 1;
  const count = Math.floor(
    (containerWidth + columnGutter) / (columnWidth + columnGutter),
  );
  return Math.max(1, count);
}

/**
 * 纯计算瀑布流布局：item 高度已知（照片由 aspectRatio 算出，header 由 measure 提供），
 * 因此所有 cell 的位置可一次性算出，滚动时不再 measure DOM —— 这是消除 masonic 强制重排
 * 的关键。每个 item 放入当前最矮的列。
 */
export function computeMasonryLayout<Item>({
  items,
  columnCount,
  columnWidth,
  columnGutter,
  rowGutter,
  getItemHeight,
}: {
  items: Item[];
  columnCount: number;
  columnWidth: number;
  columnGutter: number;
  rowGutter: number;
  getItemHeight: (item: Item, index: number) => number;
}): MasonryGridLayout {
  const safeColumnCount = Math.max(1, columnCount);
  const columnHeights = Array.from({ length: safeColumnCount }, () => 0);
  const cells: MasonryCellLayout[] = items.map((item, index) => {
    const rawHeight = getItemHeight(item, index);
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
    const column = getShortestColumnIndex(columnHeights);
    const left = column * (columnWidth + columnGutter);
    const top = columnHeights[column] ?? 0;
    columnHeights[column] = top + height + rowGutter;
    return { index, column, left, top, width: columnWidth, height };
  });
  const maxColumnHeight = columnHeights.reduce(
    (max, height) => Math.max(max, height),
    0,
  );
  // 末尾多加了一个 rowGutter，减回去得到真实内容高度。
  const totalHeight = Math.max(0, maxColumnHeight - rowGutter);
  return { cells, totalHeight, columnCount: safeColumnCount };
}

/**
 * 虚拟化：从已算好的布局里挑出与可视区（含 overscan 上下缓冲）相交的 cell。
 * O(n) 线性扫描；n 是照片总数（百量级），每帧执行成本可忽略。
 */
export function selectVisibleMasonryCells({
  cells,
  scrollTop,
  viewportHeight,
  overscanPx,
}: {
  cells: MasonryCellLayout[];
  scrollTop: number;
  viewportHeight: number;
  overscanPx: number;
}): { visible: MasonryCellLayout[]; startIndex: number; stopIndex: number } {
  const top = scrollTop - overscanPx;
  const bottom = scrollTop + viewportHeight + overscanPx;
  const visible: MasonryCellLayout[] = [];
  let startIndex = -1;
  let stopIndex = -1;

  for (const cell of cells) {
    if (cell.top + cell.height < top || cell.top > bottom) continue;
    visible.push(cell);
    if (startIndex === -1 || cell.index < startIndex) startIndex = cell.index;
    if (cell.index > stopIndex) stopIndex = cell.index;
  }

  return {
    visible,
    startIndex: startIndex === -1 ? 0 : startIndex,
    stopIndex: stopIndex === -1 ? 0 : stopIndex,
  };
}

export function estimatePhotoVirtualRect({
  headerHeight,
  isMobile,
  metrics,
  photoIndex,
  photos,
}: {
  headerHeight: number;
  isMobile: boolean;
  metrics: MasonryLayoutMetrics;
  photoIndex: number;
  photos: PhotoManifest[];
}) {
  const { columnCount, columnGutter, columnWidth, containerRect, rowGutter } =
    metrics;
  if (columnCount <= 0 || columnWidth <= 0) {
    return null;
  }

  const columnHeights = Array.from({ length: columnCount }, () => 0);
  if (!isMobile && columnHeights.length > 0 && headerHeight > 0) {
    columnHeights[0] = headerHeight + rowGutter;
  }

  for (let index = 0; index <= photoIndex; index += 1) {
    const photo = photos[index];
    if (!photo) {
      return null;
    }

    const aspectRatio = resolveAspectRatio(photo);
    const height = columnWidth / aspectRatio;
    const column = getShortestColumnIndex(columnHeights);
    const left = column * (columnWidth + columnGutter);
    const top = columnHeights[column] ?? 0;

    if (index === photoIndex) {
      return {
        left: containerRect.left + left,
        top: containerRect.top + top,
        width: columnWidth,
        height,
        borderRadius: 0,
      };
    }

    columnHeights[column] = top + height + rowGutter;
  }

  return null;
}
