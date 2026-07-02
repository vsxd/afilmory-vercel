import { describe, expect, it } from "vitest";

import {
  constrainScaleAndPosition,
  createFitTransform,
  getFitToScreenScale,
  zoomAtTransform,
} from "./transform-controller";

const geometry = {
  canvasWidth: 1000,
  canvasHeight: 500,
  imageWidth: 4000,
  imageHeight: 2000,
};
const bounds = {
  initialScale: 1,
  limitToBounds: true,
  maxScale: 10,
  minScale: 0.5,
};

describe("transform-controller", () => {
  it("creates a fit-to-screen transform from image and canvas geometry", () => {
    expect(getFitToScreenScale(geometry)).toBe(0.25);
    expect(createFitTransform(geometry, 0.8)).toEqual({
      scale: 0.2,
      translateX: 0,
      translateY: 0,
    });
  });

  it("returns a safe scale of 1 for non-positive image dimensions", () => {
    // 损坏的 manifest 会把 width/height 归一成 0；此时不能让 fit-scale 变成 Infinity/NaN。
    for (const broken of [
      { ...geometry, imageWidth: 0 },
      { ...geometry, imageHeight: 0 },
      { ...geometry, imageWidth: Number.NaN },
      { ...geometry, imageHeight: Number.POSITIVE_INFINITY },
    ]) {
      const scale = getFitToScreenScale(broken);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBe(1);
    }
  });

  it("constrains scale and translation to the configured bounds", () => {
    expect(
      constrainScaleAndPosition(
        { scale: 100, translateX: 10_000, translateY: -10_000 },
        geometry,
        bounds,
      ),
    ).toEqual({
      scale: 2.5,
      translateX: 4500,
      translateY: -2250,
    });
  });

  it("zooms around the requested point and rejects out-of-bounds zooms", () => {
    const transform = zoomAtTransform(
      { scale: 0.25, translateX: 0, translateY: 0 },
      geometry,
      bounds,
      { x: 750, y: 250 },
      2,
    );

    expect(transform).toEqual({
      scale: 0.5,
      translateX: -250,
      translateY: 0,
    });
    // 越界缩放钳制到边界（absoluteMin = fit 0.25 × minScale 0.5 = 0.125），
    // 而非整体作废——作废会让边界附近的缩小操作无响应，用户卡在放大态。
    expect(
      zoomAtTransform(
        { scale: 0.25, translateX: 0, translateY: 0 },
        geometry,
        bounds,
        { x: 500, y: 250 },
        0.1,
      ),
    ).toMatchObject({ scale: 0.125 });
    // 已在边界上再往外缩 → 无变化，返回 null。
    expect(
      zoomAtTransform(
        { scale: 0.125, translateX: 0, translateY: 0 },
        geometry,
        bounds,
        { x: 500, y: 250 },
        0.5,
      ),
    ).toBeNull();
  });
});
