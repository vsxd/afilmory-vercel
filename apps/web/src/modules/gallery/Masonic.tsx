import { useScrollViewElement } from "@afilmory/ui";
import * as React from "react";

import type { MasonryCellLayout } from "./gallery-layout";
import {
  computeMasonryLayout,
  resolveEffectiveColumnWidth,
  resolveMasonryColumnCount,
  selectVisibleMasonryCells,
} from "./gallery-layout";

export interface MasonryRef {
  getLayoutMetrics: () => MasonryLayoutMetrics | null;
  getItemRect: (index: number) => DOMRect | null;
  reposition: () => void;
}

export interface MasonryLayoutMetrics {
  columnCount: number;
  columnGutter: number;
  columnWidth: number;
  containerRect: DOMRect;
  rowGutter: number;
}

export interface MasonryRenderProps<Item> {
  index: number;
  data: Item;
  width: number;
}

export interface MasonryProps<Item> {
  ref?: React.Ref<MasonryRef>;
  items: Item[];
  columnWidth: number;
  columnGutter?: number;
  rowGutter?: number;
  /** 上下各预渲染多少个视口高度作为缓冲，默认 2。 */
  overscanBy?: number;
  /** 高度未知（需 measure）的 item 的初始估计高度。 */
  itemHeightEstimate?: number;
  itemKey?: (data: Item, index: number) => React.Key;
  /**
   * 返回 item 高度。返回非有限值 / <= 0 表示"高度未知，需要 measure"
   * （例如桌面端的 header）。照片应根据 aspectRatio 返回确定高度，从而完全纯计算。
   */
  itemHeight?: (data: Item, columnWidth: number, index: number) => number;
  render: (props: MasonryRenderProps<Item>) => React.ReactNode;
  onRender?: (startIndex: number, stopIndex: number, items: Item[]) => void;
  role?: string;
  tabIndex?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 纯计算虚拟瀑布流（替代 masonic）。
 *
 * 核心：照片高度由 manifest 的 aspectRatio 直接算出，所有 cell 的位置一次性纯计算得到，
 * 滚动时只做 `filter(可见)` + `transform` 定位，不再 measure DOM —— 因此没有 masonic
 * 那样的强制重排（forced reflow），可每帧更新、跟手且稳定 60fps。仅高度未知的 header
 * 才用 ResizeObserver measure（桌面 1 个，非滚动热路径）。
 */
export const Masonry = <Item,>(props: MasonryProps<Item>) => {
  const {
    ref,
    items,
    columnWidth,
    columnGutter = 0,
    rowGutter = columnGutter,
    overscanBy = 2,
    itemHeightEstimate = 400,
    itemKey,
    itemHeight,
    render,
    onRender,
    role,
    tabIndex,
    className,
    style,
  } = props;

  const scrollElement = useScrollViewElement();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  // 需 measure 的 item（如桌面 header）：index -> measured height。
  const [measuredHeights, setMeasuredHeights] = React.useState<
    ReadonlyMap<number, number>
  >(() => new Map());

  // 滚动监听：passive + rAF，每帧最多一次 setScrollTop —— 跟手且不抖动。
  React.useEffect(() => {
    if (!scrollElement) return;
    let rafId = 0;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      rafId = requestAnimationFrame(() => {
        queued = false;
        setScrollTop(scrollElement.scrollTop);
      });
    };
    setScrollTop(scrollElement.scrollTop);
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [scrollElement]);

  // 视口高度（滚动容器可视高度）。
  React.useEffect(() => {
    if (!scrollElement || typeof ResizeObserver === "undefined") return;
    const update = () => setViewportHeight(scrollElement.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  // 容器宽度（决定列数/列宽）。用 useLayoutEffect 在首帧 paint 前同步测量，
  // 避免初始 containerWidth=0 →（单列）→ 多列 的闪烁。
  React.useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 列数按"目标列宽"推导，但实际列宽要把容器**填满**：否则固定列宽会在右侧留黑边。
  // effectiveColumnWidth = (容器宽 - 所有 gutter) / 列数。
  const columnCount = resolveMasonryColumnCount({
    containerWidth: containerWidth || columnWidth,
    columnWidth,
    columnGutter,
  });
  const effectiveColumnWidth = resolveEffectiveColumnWidth({
    containerWidth,
    columnCount,
    columnGutter,
    fallbackColumnWidth: columnWidth,
  });
  // 喂给 itemHeight / metrics 的列宽取整，与 computeMasonryLayout 内部的 cell 宽
  // 取整保持同源 —— 否则 render 拿到的 width 与算高度用的 width 差出小数，壳与
  // 内容可能相差 1px（整数几何的意义见 gallery-layout.ts computeMasonryItemHeight）。
  const renderColumnWidth = Math.max(1, Math.round(effectiveColumnWidth));

  const getHeight = React.useCallback(
    (item: Item, index: number): number => {
      const measured = measuredHeights.get(index);
      if (measured && measured > 0) return measured;
      const computed = itemHeight?.(item, renderColumnWidth, index);
      if (computed && Number.isFinite(computed) && computed > 0)
        return computed;
      return itemHeightEstimate;
    },
    [renderColumnWidth, itemHeight, itemHeightEstimate, measuredHeights],
  );

  const layout = React.useMemo(
    () =>
      computeMasonryLayout({
        items,
        columnCount,
        columnWidth: effectiveColumnWidth,
        columnGutter,
        rowGutter,
        getItemHeight: getHeight,
      }),
    [
      items,
      columnCount,
      effectiveColumnWidth,
      columnGutter,
      rowGutter,
      getHeight,
    ],
  );

  const overscanPx = Math.max(viewportHeight || columnWidth, 1) * overscanBy;
  const { visible, startIndex, stopIndex } = React.useMemo(
    () =>
      selectVisibleMasonryCells({
        cells: layout.cells,
        scrollTop,
        viewportHeight: viewportHeight || columnWidth,
        overscanPx,
      }),
    [layout.cells, scrollTop, viewportHeight, overscanPx, columnWidth],
  );

  React.useEffect(() => {
    onRender?.(startIndex, stopIndex, items);
  }, [onRender, startIndex, stopIndex, items]);

  // 稳定的 measure 回调：身份跨滚动帧不变，MasonryCell 的 effect 才不会在每次
  // setScrollTop 重渲染时重挂 ResizeObserver + 重读 offsetHeight（强制重排——
  // 正是本组件为消除 masonic 强制重排而存在，热路径上不能再引入）。
  const handleMeasure = React.useCallback((index: number, height: number) => {
    setMeasuredHeights((prev) => {
      if (prev.get(index) === height) return prev;
      const next = new Map(prev);
      next.set(index, height);
      return next;
    });
  }, []);

  // 哪些 index 的高度未知、需要 measure（itemHeight 返回非正值）。
  const measureIndices = React.useMemo(() => {
    const set = new Set<number>();
    items.forEach((item, index) => {
      const height = itemHeight?.(item, renderColumnWidth, index);
      if (!height || !Number.isFinite(height) || height <= 0) set.add(index);
    });
    return set;
  }, [items, itemHeight, renderColumnWidth]);

  React.useImperativeHandle(
    ref,
    () => ({
      getLayoutMetrics: () => {
        const container = containerRef.current;
        if (!container) return null;
        return {
          columnCount: layout.columnCount,
          columnGutter,
          columnWidth: renderColumnWidth,
          containerRect: container.getBoundingClientRect(),
          rowGutter,
        };
      },
      getItemRect: (index: number) => {
        const cell = layout.cells[index];
        const container = containerRef.current;
        if (!cell || !container) return null;
        const containerRect = container.getBoundingClientRect();
        return new DOMRect(
          containerRect.left + cell.left,
          containerRect.top + cell.top,
          cell.width,
          cell.height,
        );
      },
      reposition: () => {
        // 纯计算布局无需手动重排；保留接口以兼容旧调用方，触发一次重算即可。
        setMeasuredHeights((prev) => new Map(prev));
      },
    }),
    [columnGutter, renderColumnWidth, layout, rowGutter],
  );

  return (
    <div
      ref={containerRef}
      role={role}
      tabIndex={tabIndex}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: layout.totalHeight,
        ...style,
      }}
    >
      {visible.map((cell) => {
        const data = items[cell.index];
        if (data === undefined) return null;
        const key = itemKey ? itemKey(data, cell.index) : cell.index;
        const needsMeasure = measureIndices.has(cell.index);
        return (
          <MasonryCell
            key={key}
            cell={cell}
            needsMeasure={needsMeasure}
            onMeasure={handleMeasure}
          >
            {render({ index: cell.index, data, width: cell.width })}
          </MasonryCell>
        );
      })}
    </div>
  );
};

interface MasonryCellProps {
  cell: MasonryCellLayout;
  needsMeasure: boolean;
  onMeasure: (index: number, height: number) => void;
  children: React.ReactNode;
}

const MasonryCell = ({
  cell,
  needsMeasure,
  onMeasure,
  children,
}: MasonryCellProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const { index } = cell;

  React.useEffect(() => {
    if (!needsMeasure || typeof ResizeObserver === "undefined") return;
    const element = ref.current;
    if (!element) return;
    const measure = () => onMeasure(index, element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [needsMeasure, onMeasure, index]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: cell.width,
        // 显式高度让 contain:paint 的绘制边界与布局值精确一致（内容驱动的高度在
        // 光栅化时可能与布局值有亚像素出入 → hairline 缝）。待测量的 cell（header）
        // 高度未知，保持内容驱动。
        height: needsMeasure ? undefined : cell.height,
        transform: `translate(${cell.left}px, ${cell.top}px)`,
        // 限制布局/重绘的影响范围到单个 cell，进一步减少滚动时的样式重算成本。
        contain: "layout paint",
      }}
    >
      {children}
    </div>
  );
};
