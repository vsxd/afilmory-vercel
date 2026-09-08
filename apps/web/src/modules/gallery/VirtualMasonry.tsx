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
  pinIndex: (index: number) => void;
  scrollToIndex: (
    index: number,
    options?: { focus?: boolean; align?: "start" | "center" | "end" },
  ) => void;
}

export interface MasonryLayoutMetrics {
  columnCount: number;
  columnGutter: number;
  /** 渲染列宽（整数，= round(layoutColumnWidth)）：itemHeight 吃的宽度。 */
  columnWidth: number;
  containerRect: DOMRect;
  /**
   * 布局列宽（可能带小数）：实际布局用它算 left，把小数摊进各列
   * （见 computeMasonryLayout 的 `left = round(column * (columnWidth + gutter))`）。
   * 复算布局（estimatePhotoVirtualRect）必须用它定位，用 columnWidth 算高度，
   * 才能和真实布局逐像素一致。
   */
  layoutColumnWidth: number;
  rowGutter: number;
}

export interface MasonryRenderProps<Item> {
  index: number;
  data: Item;
  width: number;
}

export interface MasonryProps<Item> {
  ref?: React.Ref<MasonryRef>;
  items: readonly Item[];
  /**
   * 目标列宽。函数形式接收本组件 ResizeObserver 实测的容器宽度——列宽推导与
   * 实际布局由此共享同一个宽度来源（消除 window.innerWidth 与容器实测的双源失配）。
   */
  columnWidth: number | ((measuredContainerWidth: number) => number);
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
  onRender?: (
    startIndex: number,
    stopIndex: number,
    items: readonly Item[],
    visibleIndices: number[],
  ) => void;
  role?: string;
  tabIndex?: number;
  "aria-label"?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
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
    "aria-label": ariaLabel,
    onKeyDown,
    className,
    style,
  } = props;

  const scrollElement = useScrollViewElement();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [containerScrollOffset, setContainerScrollOffset] = React.useState(0);
  const [pinnedIndex, setPinnedIndex] = React.useState<number | null>(null);
  const pendingFocusIndexRef = React.useRef<number | null>(null);
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
    if (!scrollElement) return;
    const update = () => setViewportHeight(scrollElement.clientHeight);
    update();
    window.addEventListener("resize", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(scrollElement);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [scrollElement]);

  // 容器宽度（决定列数/列宽）。用 useLayoutEffect 在首帧 paint 前同步测量，
  // 避免初始 containerWidth=0 →（单列）→ 多列 的闪烁。
  React.useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    window.addEventListener("resize", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // A mobile header sits before the masonry container in normal flow. Raw
  // body.scrollTop therefore cannot be compared directly with cell.top; cache
  // the container's offset in the scroll content and select against a relative
  // viewport. Reads happen on layout changes, never in the scroll hot path.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !scrollElement) return;

    const updateOffset = () => {
      const viewportTop =
        scrollElement === document.body
          ? 0
          : scrollElement.getBoundingClientRect().top;
      const nextOffset =
        container.getBoundingClientRect().top -
        viewportTop +
        scrollElement.scrollTop;
      setContainerScrollOffset((current) =>
        current === nextOffset ? current : nextOffset,
      );
    };

    updateOffset();
    window.addEventListener("resize", updateOffset, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updateOffset);
    }
    const observer = new ResizeObserver(updateOffset);
    observer.observe(container.parentElement ?? container);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [scrollElement]);

  // 目标列宽与实际布局共用同一个实测宽度：函数形式的 columnWidth 吃的就是
  // 本组件 ResizeObserver 的 containerWidth，双源失配从构造上消除。
  const targetColumnWidth =
    typeof columnWidth === "function"
      ? columnWidth(containerWidth)
      : columnWidth;

  // 列数按"目标列宽"推导，但实际列宽要把容器**填满**：否则固定列宽会在右侧留黑边。
  // effectiveColumnWidth = (容器宽 - 所有 gutter) / 列数。
  const columnCount = resolveMasonryColumnCount({
    containerWidth: containerWidth || targetColumnWidth,
    columnWidth: targetColumnWidth,
    columnGutter,
  });
  const effectiveColumnWidth = resolveEffectiveColumnWidth({
    containerWidth,
    columnCount,
    columnGutter,
    fallbackColumnWidth: targetColumnWidth,
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

  const overscanPx =
    Math.max(viewportHeight || targetColumnWidth, 1) * overscanBy;
  const masonryScrollTop = scrollTop - containerScrollOffset;
  const effectiveViewportHeight = viewportHeight || targetColumnWidth;
  // 自然可见选择（带 overscan、不含 pin）：pin 清除与零 overscan 派生都基于它。
  const baseSelection = React.useMemo(
    () =>
      selectVisibleMasonryCells({
        cells: layout.cells,
        columns: layout.columns,
        scrollTop: masonryScrollTop,
        viewportHeight: effectiveViewportHeight,
        overscanPx,
      }),
    [
      layout.cells,
      layout.columns,
      masonryScrollTop,
      effectiveViewportHeight,
      overscanPx,
    ],
  );

  // pin 只为在目标 cell 滚入视野前强制挂载（scrollToIndex/聚焦）；一旦它自然
  // 进入可见选择立即解除 —— 否则聚焦过的 cell 整个会话被强制渲染，且此后每个
  // 滚动帧都为离屏 pin 多付 some + 拼接排序。对已可见 cell 的 pin 会即刻清除。
  React.useEffect(() => {
    if (pinnedIndex === null) return;
    if (baseSelection.visible.some((cell) => cell.index === pinnedIndex)) {
      setPinnedIndex(null);
    }
  }, [baseSelection.visible, pinnedIndex]);

  const { visible } = React.useMemo(() => {
    if (
      pinnedIndex === null ||
      baseSelection.visible.some((cell) => cell.index === pinnedIndex)
    ) {
      return baseSelection;
    }
    const pinnedCell = layout.cells[pinnedIndex];
    return pinnedCell
      ? {
          ...baseSelection,
          visible: [...baseSelection.visible, pinnedCell].sort(
            (left, right) => left.index - right.index,
          ),
        }
      : baseSelection;
  }, [baseSelection, layout.cells, pinnedIndex]);

  // 刻意不给依赖数组：pin 一个已可见的 cell 不会改变 visible 的身份（baseSelection
  // 不含 pin），按 [visible] 触发会漏掉"目标已渲染、无需滚动"的聚焦。每次渲染都跑，
  // 无待聚焦目标时一个 ref 判空即返回，热路径零成本。
  React.useLayoutEffect(() => {
    const index = pendingFocusIndexRef.current;
    if (index === null) return;
    const container = containerRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-masonry-cell-index="${index}"] [data-gallery-photo-link]`,
    );
    if (!target) return;
    pendingFocusIndexRef.current = null;
    target.focus({ preventScroll: true });
  });

  // 零 overscan 的"真视口"index 集合（onRender 契约）：从带 overscan 的自然选择
  // 里按视口边界过滤（谓词与 selectVisibleMasonryCells 的可见性判断一致，真视口
  // 集必是其子集），省掉每个滚动帧的第二次全量选择。内容未变时保留上一次数组
  // 身份 —— 滚动只推进 overscan 时 onRender 与下游按 identity 早退的缓存才不失效。
  const viewportVisibleIndicesRef = React.useRef<number[]>([]);
  const viewportVisibleIndices = React.useMemo(() => {
    const viewportBottom = masonryScrollTop + effectiveViewportHeight;
    const next: number[] = [];
    for (const cell of baseSelection.visible) {
      if (
        cell.top + cell.height >= masonryScrollTop &&
        cell.top <= viewportBottom
      ) {
        next.push(cell.index);
      }
    }
    const previous = viewportVisibleIndicesRef.current;
    if (
      previous.length === next.length &&
      previous.every((value, index) => value === next[index])
    ) {
      return previous;
    }
    viewportVisibleIndicesRef.current = next;
    return next;
  }, [baseSelection.visible, masonryScrollTop, effectiveViewportHeight]);
  // baseSelection.visible 已按 index 升序，首尾即区间端点（空集回退 0，与
  // selectVisibleMasonryCells 的约定一致）。
  const viewportStartIndex = viewportVisibleIndices[0] ?? 0;
  const viewportStopIndex = viewportVisibleIndices.at(-1) ?? 0;

  React.useEffect(() => {
    onRender?.(
      viewportStartIndex,
      viewportStopIndex,
      items,
      viewportVisibleIndices,
    );
  }, [
    items,
    onRender,
    viewportStartIndex,
    viewportStopIndex,
    viewportVisibleIndices,
  ]);

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
          layoutColumnWidth: effectiveColumnWidth,
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
      pinIndex: (index: number) => {
        if (layout.cells[index]) setPinnedIndex(index);
      },
      scrollToIndex: (index, options = {}) => {
        const cell = layout.cells[index];
        if (!cell || !scrollElement) return;
        setPinnedIndex(index);
        if (options.focus) pendingFocusIndexRef.current = index;

        const align = options.align ?? "center";
        const viewport = Math.max(
          viewportHeight,
          scrollElement.clientHeight,
          1,
        );
        const alignmentOffset =
          align === "start"
            ? 0
            : align === "end"
              ? viewport - cell.height
              : (viewport - cell.height) / 2;
        const top = Math.max(
          0,
          containerScrollOffset + cell.top - alignmentOffset,
        );
        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        scrollElement.scrollTo({
          top,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      },
    }),
    [
      columnGutter,
      effectiveColumnWidth,
      renderColumnWidth,
      layout,
      rowGutter,
      scrollElement,
      viewportHeight,
      containerScrollOffset,
    ],
  );

  return (
    <div
      ref={containerRef}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
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
            role={role === "grid" ? "gridcell" : undefined}
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
  role?: string;
  needsMeasure: boolean;
  onMeasure: (index: number, height: number) => void;
  children: React.ReactNode;
}

const MasonryCell = ({
  cell,
  role,
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
      role={role}
      data-masonry-cell-index={index}
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
