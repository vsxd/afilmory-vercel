import { describe, expect, it } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import {
  calculateGalleryColumnWidth,
  createMasonryItems,
  estimatePhotoVirtualRect,
  getMasonryAnimationDelay,
  getMasonryItemKey,
  getPhotoSetKey,
  MasonryHeaderItem,
  shouldAnimateMasonryItem,
} from "./gallery-layout";

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
