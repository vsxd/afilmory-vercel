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
    expect(
      zoomAtTransform(
        { scale: 0.25, translateX: 0, translateY: 0 },
        geometry,
        bounds,
        { x: 500, y: 250 },
        0.1,
      ),
    ).toBeNull();
  });
});
