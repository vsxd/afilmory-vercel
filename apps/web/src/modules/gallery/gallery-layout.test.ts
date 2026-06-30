import { describe, expect, it } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import {
  calculateGalleryColumnWidth,
  computeMasonryLayout,
  createMasonryItems,
  estimatePhotoVirtualRect,
  getMasonryAnimationDelay,
  getMasonryItemKey,
  getPhotoSetKey,
  MasonryHeaderItem,
  resolveAspectRatio,
  resolveMasonryColumnCount,
  selectVisibleMasonryCells,
  shouldAnimateMasonryItem,
} from "./gallery-layout";

describe("resolveAspectRatio", () => {
  it("returns the provided aspect ratio when valid", () => {
    expect(resolveAspectRatio({ aspectRatio: 1.5 })).toBe(1.5);
  });

  it("falls back to width/height when aspectRatio is missing", () => {
    expect(resolveAspectRatio({ width: 800, height: 400 })).toBe(2);
  });

  it("returns 1 for zero, NaN, negative, or unusable inputs", () => {
    expect(resolveAspectRatio({ aspectRatio: 0, width: 0, height: 0 })).toBe(1);
    expect(resolveAspectRatio({ aspectRatio: Number.NaN })).toBe(1);
    expect(resolveAspectRatio({ aspectRatio: -2 })).toBe(1);
    expect(resolveAspectRatio({ width: 100, height: 0 })).toBe(1);
    expect(resolveAspectRatio({})).toBe(1);
  });
});

const createPhoto = (id: string, aspectRatio = 1): PhotoManifest =>
  ({
    aspectRatio,
    height: 100,
    id,
    width: 100,
  }) as PhotoManifest;

describe("gallery-layout helpers", () => {
  it("builds stable masonry items and photo set keys", () => {
    const photos = [createPhoto("a"), createPhoto("b")];

    expect(getPhotoSetKey(photos)).toBe(getPhotoSetKey(photos));
    expect(createMasonryItems(photos, true)).toEqual(photos);
    expect(createMasonryItems(photos, false)[0]).toBe(
      MasonryHeaderItem.default,
    );
    expect(getMasonryItemKey(MasonryHeaderItem.default)).toBe("header");
    expect(getMasonryItemKey(photos[0])).toBe("a");
  });

  it("calculates responsive column width", () => {
    expect(
      calculateGalleryColumnWidth({
        columns: "auto",
        containerWidth: 2000,
        isMobile: false,
      }),
    ).toBe(250);
    expect(
      calculateGalleryColumnWidth({
        columns: "auto",
        containerWidth: 2500,
        isMobile: false,
      }),
    ).toBe(305);
    expect(
      calculateGalleryColumnWidth({
        columns: 3,
        containerWidth: 900,
        isMobile: false,
      }),
    ).toBeCloseTo(286.67, 2);
  });

  it("estimates virtual photo rect with a desktop header occupying the first column", () => {
    const rect = estimatePhotoVirtualRect({
      headerHeight: 120,
      isMobile: false,
      metrics: {
        columnCount: 2,
        columnGutter: 4,
        columnWidth: 100,
        containerRect: DOMRect.fromRect({
          x: 10,
          y: 20,
          width: 204,
          height: 400,
        }),
        rowGutter: 4,
      },
      photoIndex: 0,
      photos: [createPhoto("a", 2)],
    });

    expect(rect).toEqual({
      borderRadius: 0,
      height: 50,
      left: 114,
      top: 20,
      width: 100,
    });
  });

  it("keeps first-screen animation decisions pure", () => {
    const photo = createPhoto("a");
    expect(shouldAnimateMasonryItem({ hasAnimated: false, index: 2 })).toBe(
      true,
    );
    expect(shouldAnimateMasonryItem({ hasAnimated: true, index: 2 })).toBe(
      false,
    );
    expect(
      getMasonryAnimationDelay({
        data: photo,
        index: 20,
        shouldAnimate: true,
      }),
    ).toBe(0.3);
  });
});

describe("resolveMasonryColumnCount", () => {
  it("derives column count from container width / column width", () => {
    // (404 + 4) / (100 + 4) = 3.92 -> 3 列
    expect(
      resolveMasonryColumnCount({
        containerWidth: 404,
        columnWidth: 100,
        columnGutter: 4,
      }),
    ).toBe(3);
  });

  it("never returns less than 1 column", () => {
    expect(
      resolveMasonryColumnCount({
        containerWidth: 0,
        columnWidth: 100,
        columnGutter: 4,
      }),
    ).toBe(1);
    expect(
      resolveMasonryColumnCount({
        containerWidth: 50,
        columnWidth: 100,
        columnGutter: 4,
      }),
    ).toBe(1);
  });
});

describe("computeMasonryLayout", () => {
  it("places each item into the shortest column (masonry) and reports total height", () => {
    // 2 列，列宽 100，gutter 0。高度：50,100,30,30
    const { cells, totalHeight, columnCount } = computeMasonryLayout({
      items: [{ h: 50 }, { h: 100 }, { h: 30 }, { h: 30 }],
      columnCount: 2,
      columnWidth: 100,
      columnGutter: 0,
      rowGutter: 0,
      getItemHeight: (item) => item.h,
    });

    expect(columnCount).toBe(2);
    // item0 -> col0 (top0), item1 -> col1 (top0), item2 -> col0 (top50,因 col0=50<col1=100),
    // item3 -> col0 (top80,col0=80<col1=100)
    expect(cells.map((c) => ({ col: c.column, top: c.top }))).toEqual([
      { col: 0, top: 0 },
      { col: 1, top: 0 },
      { col: 0, top: 50 },
      { col: 0, top: 80 },
    ]);
    // 列高：col0 = 50+30+30 = 110, col1 = 100 -> 总高 110
    expect(totalHeight).toBe(110);
  });

  it("applies column and row gutters", () => {
    const { cells } = computeMasonryLayout({
      items: [{ h: 40 }, { h: 40 }],
      columnCount: 2,
      columnWidth: 100,
      columnGutter: 10,
      rowGutter: 6,
      getItemHeight: (item) => item.h,
    });
    expect(cells[1]!.left).toBe(110); // 第二列 left = 100 + 10
  });

  it("falls back to a positive height for invalid item heights", () => {
    const { cells } = computeMasonryLayout({
      items: [{ h: Number.NaN }],
      columnCount: 1,
      columnWidth: 100,
      columnGutter: 0,
      rowGutter: 0,
      getItemHeight: (item) => item.h,
    });
    expect(cells[0]!.height).toBeGreaterThan(0);
  });
});

describe("selectVisibleMasonryCells", () => {
  const cells = [
    { index: 0, column: 0, left: 0, top: 0, width: 100, height: 100 },
    { index: 1, column: 0, left: 0, top: 100, width: 100, height: 100 },
    { index: 2, column: 0, left: 0, top: 2000, width: 100, height: 100 },
  ];

  it("includes only cells intersecting the viewport + overscan band", () => {
    const { visible, startIndex, stopIndex } = selectVisibleMasonryCells({
      cells,
      scrollTop: 0,
      viewportHeight: 150,
      overscanPx: 0,
    });
    // 视口 [0,150]：cell0(0-100) 和 cell1(100-200) 相交；cell2(2000+) 不在
    expect(visible.map((c) => c.index)).toEqual([0, 1]);
    expect(startIndex).toBe(0);
    expect(stopIndex).toBe(1);
  });

  it("pulls in far cells once overscan is large enough", () => {
    const { visible } = selectVisibleMasonryCells({
      cells,
      scrollTop: 0,
      viewportHeight: 150,
      overscanPx: 2000,
    });
    expect(visible.map((c) => c.index)).toEqual([0, 1, 2]);
  });
});
