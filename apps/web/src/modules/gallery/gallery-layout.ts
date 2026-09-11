import type { PhotoManifest } from "~/types/photo";

import type { MasonryLayoutMetrics } from "./VirtualMasonry";

export class MasonryHeaderItem {
  static default = new MasonryHeaderItem();
}

export type MasonryItemType = PhotoManifest | MasonryHeaderItem;

export const FIRST_SCREEN_ITEMS_COUNT = 30;
export const GALLERY_GUTTER = 4;

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

/**
 * 照片格的整数高度。布局（Masonic 的 itemHeight）与格子自身（MasonryPhotoItem 的
 * inline height）必须走同一个函数，保证两者零漂移。
 *
 * 取整的原因：喂给 DOM 的几何必须全是整数 CSS px。非整数高度会让长滚动层内所有
 * cell 的 y 坐标带小数，iOS WebKit 的分块光栅化（tiling）对此会在固定内容位置留下
 * 1 设备像素的未上漆横缝——表现为「滚动到某处出现一条横跨整屏的细黑线」（透出深色
 * 页面背景）。被替换的 masonic 因用 offsetHeight（整数）测量而天然无此问题。
 */
export function computeMasonryItemHeight(
  columnWidth: number,
  photo: { aspectRatio?: number; width?: number; height?: number },
): number {
  return Math.max(1, Math.round(columnWidth / resolveAspectRatio(photo)));
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

export function getPhotoSetKey(photos: readonly PhotoManifest[]): string {
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

/**
 * 由「实测的瀑布流容器宽度」推导目标列宽。
 *
 * containerWidth 必须是 Masonry 容器元素的实测 clientWidth（ResizeObserver 提供，
 * 已天然扣除页面 padding 与滚动条），而不是 window.innerWidth——旧实现用
 * `innerWidth - 8/32` 硬编码猜测 padding，一旦壳层 padding 或滚动条槽变化，
 * 列数判定就会和真实容器悄悄失配（经典滚动条的 Windows 上会多算 ~15px）。
 */
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
  const gutter = GALLERY_GUTTER;
  const availableWidth = containerWidth;

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
  photos: readonly PhotoManifest[],
  isMobile: boolean,
): readonly MasonryItemType[] {
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
  columns: MasonryCellLayout[][];
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
 * 实际列宽：把容器宽度（去掉列间距）按列数均分，使瀑布流填满容器、右侧不留白。
 * 容器宽度未知（首帧为 0）时回退到目标列宽。
 */
export function resolveEffectiveColumnWidth({
  containerWidth,
  columnCount,
  columnGutter,
  fallbackColumnWidth,
}: {
  containerWidth: number;
  columnCount: number;
  columnGutter: number;
  fallbackColumnWidth: number;
}): number {
  if (containerWidth <= 0 || columnCount <= 0) return fallbackColumnWidth;
  return Math.max(
    1,
    (containerWidth - (columnCount - 1) * columnGutter) / columnCount,
  );
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
  items: readonly Item[];
  columnCount: number;
  columnWidth: number;
  columnGutter: number;
  rowGutter: number;
  getItemHeight: (item: Item, index: number) => number;
}): MasonryGridLayout {
  const safeColumnCount = Math.max(1, columnCount);
  // 几何全整数（见 computeMasonryItemHeight 注释）：列宽/高度/坐标一律取整，
  // 消除长滚动层里的小数 y 坐标（iOS WebKit 分块光栅化的 hairline 缝根源）。
  const cellWidth = Math.max(1, Math.round(columnWidth));
  const columnHeights = Array.from({ length: safeColumnCount }, () => 0);
  const columns = Array.from(
    { length: safeColumnCount },
    (): MasonryCellLayout[] => [],
  );
  const cells: MasonryCellLayout[] = items.map((item, index) => {
    const rawHeight = getItemHeight(item, index);
    const height =
      Number.isFinite(rawHeight) && rawHeight > 0 ? Math.round(rawHeight) : 1;
    const column = getShortestColumnIndex(columnHeights);
    const left = Math.round(column * (columnWidth + columnGutter));
    const top = columnHeights[column] ?? 0;
    columnHeights[column] = top + height + rowGutter;
    const cell = { index, column, left, top, width: cellWidth, height };
    columns[column]?.push(cell);
    return cell;
  });
  const maxColumnHeight = columnHeights.reduce(
    (max, height) => Math.max(max, height),
    0,
  );
  // 末尾多加了一个 rowGutter，减回去得到真实内容高度。
  const totalHeight = Math.max(0, Math.ceil(maxColumnHeight - rowGutter));
  return { cells, columns, totalHeight, columnCount: safeColumnCount };
}

/**
 * 虚拟化：从已算好的布局里挑出与可视区（含 overscan 上下缓冲）相交的 cell。
 * With the optional per-column index, selection is O(columns × log n +
 * visible), instead of scanning the entire library on every scroll frame.
 */
export function selectVisibleMasonryCells({
  cells,
  columns,
  scrollTop,
  viewportHeight,
  overscanPx,
}: {
  cells: MasonryCellLayout[];
  columns?: readonly (readonly MasonryCellLayout[])[];
  scrollTop: number;
  viewportHeight: number;
  overscanPx: number;
}): { visible: MasonryCellLayout[]; startIndex: number; stopIndex: number } {
  const top = scrollTop - overscanPx;
  const bottom = scrollTop + viewportHeight + overscanPx;
  const visible: MasonryCellLayout[] = [];
  let startIndex = -1;
  let stopIndex = -1;

  const addCell = (cell: MasonryCellLayout) => {
    visible.push(cell);
    if (startIndex === -1 || cell.index < startIndex) startIndex = cell.index;
    if (cell.index > stopIndex) stopIndex = cell.index;
  };

  if (columns) {
    for (const column of columns) {
      let low = 0;
      let high = column.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const cell = column[middle];
        if (cell && cell.top + cell.height < top) low = middle + 1;
        else high = middle;
      }

      for (let index = low; index < column.length; index += 1) {
        const cell = column[index];
        if (!cell || cell.top > bottom) break;
        addCell(cell);
      }
    }
    // Keep DOM/tab order aligned with manifest order across columns.
    visible.sort((left, right) => left.index - right.index);
  } else {
    for (const cell of cells) {
      if (cell.top + cell.height < top || cell.top > bottom) continue;
      addCell(cell);
    }
  }

  return {
    visible,
    startIndex: startIndex === -1 ? 0 : startIndex,
    stopIndex: stopIndex === -1 ? 0 : stopIndex,
  };
}

/**
 * 估算某张照片在虚拟瀑布流里的屏幕矩形（cell 未渲染、getItemRect 拿不到时用）。
 *
 * 实现上直接调用 computeMasonryLayout 复算同一份布局：items 结构与 MasonryRoot
 * 一致（桌面端 header 哨兵占 index 0，占位高度用测得的 headerHeight；空高度的
 * header 与真实布局一样不占位——真实布局里它尚未 measure 时照片也按无 header 排）。
 * 宽度必须复刻真实布局的**双宽度**组合：left 用小数 layoutColumnWidth（真实布局
 * 把小数摊进各列，用取整宽复算会在右侧列漂移数 px），高度用整数 columnWidth
 * （真实布局的 getHeight 吃的就是取整宽）。于是「估算与真实布局逐像素一致」
 * 是构造性成立的，不再靠手抄放置循环维持。每次打开/关闭 viewer 才跑一次，
 * O(n)（n 为照片数，百量级）可忽略。
 */
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
  photos: readonly PhotoManifest[];
}) {
  const {
    columnCount,
    columnGutter,
    columnWidth,
    containerRect,
    layoutColumnWidth,
    rowGutter,
  } = metrics;
  if (columnCount <= 0 || columnWidth <= 0 || layoutColumnWidth <= 0) {
    return null;
  }
  if (photoIndex < 0 || photoIndex >= photos.length) {
    return null;
  }

  const includeHeader = !isMobile && headerHeight > 0;
  // 目标照片之后的 item 不影响它的位置，截断到目标即可。
  const targetPhotos = photos.slice(0, photoIndex + 1);
  if (targetPhotos.some((photo) => !photo)) {
    return null;
  }

  const items: MasonryItemType[] = includeHeader
    ? [MasonryHeaderItem.default, ...targetPhotos]
    : targetPhotos;
  const { cells } = computeMasonryLayout({
    items,
    columnCount,
    columnWidth: layoutColumnWidth,
    columnGutter,
    rowGutter,
    getItemHeight: (item) =>
      item instanceof MasonryHeaderItem
        ? headerHeight
        : computeMasonryItemHeight(columnWidth, item),
  });

  const cell = cells[includeHeader ? photoIndex + 1 : photoIndex];
  if (!cell) {
    return null;
  }

  return {
    left: containerRect.left + cell.left,
    top: containerRect.top + cell.top,
    width: cell.width,
    height: cell.height,
    borderRadius: 0,
  };
}
