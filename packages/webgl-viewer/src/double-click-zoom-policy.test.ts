import { describe, expect, it } from "vitest";

import { resolveDoubleClickToggle } from "./double-click-zoom-policy";

describe("double-click zoom policy", () => {
  it("toggles from fitted scale to configured double-click scale", () => {
    const result = resolveDoubleClickToggle({
      isZoomed: false,
      point: { x: 50, y: 50 },
      transform: { scale: 0.1, translateX: 0, translateY: 0 },
      canvasWidth: 100,
      canvasHeight: 100,
      fitToScreenScale: 0.1,
      initialScale: 1,
      minScale: 1,
      maxScale: 20,
      step: 2,
    });

    expect(result.isZoomed).toBe(true);
    expect(result.transform.scale).toBeCloseTo(0.2);
  });

  it("toggles back to configured fitted scale", () => {
    const result = resolveDoubleClickToggle({
      isZoomed: true,
      point: { x: 50, y: 50 },
      transform: { scale: 0.2, translateX: 0, translateY: 0 },
      canvasWidth: 100,
      canvasHeight: 100,
      fitToScreenScale: 0.1,
      initialScale: 1,
      minScale: 1,
      maxScale: 20,
      step: 2,
    });

    expect(result.isZoomed).toBe(false);
    expect(result.transform.scale).toBeCloseTo(0.1);
  });

  it("caps double-click zoom at original image size", () => {
    const result = resolveDoubleClickToggle({
      isZoomed: false,
      point: { x: 400, y: 400 },
      transform: { scale: 0.8, translateX: 0, translateY: 0 },
      canvasWidth: 800,
      canvasHeight: 800,
      fitToScreenScale: 0.8,
      initialScale: 1,
      minScale: 1,
      maxScale: 20,
      step: 2,
    });

    expect(result.transform.scale).toBe(1);
  });
});
