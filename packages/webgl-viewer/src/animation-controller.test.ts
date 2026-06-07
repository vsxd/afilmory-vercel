import { describe, expect, it } from "vitest";

import {
  interpolateTransform,
  TransformAnimationController,
} from "./animation-controller";

describe("TransformAnimationController", () => {
  it("interpolates transform state and completes at the target", () => {
    const controller = new TransformAnimationController();
    controller.start({
      duration: 100,
      from: { scale: 1, translateX: 0, translateY: 0 },
      startLOD: 2,
      startTime: 1000,
      to: { scale: 3, translateX: 20, translateY: -10 },
    });

    expect(controller.isAnimating).toBe(true);
    expect(controller.startLOD).toBe(2);
    expect(controller.step(1050, false)).toEqual({
      done: false,
      transform: { scale: 2, translateX: 10, translateY: -5 },
    });
    expect(controller.step(1100, false)).toEqual({
      done: true,
      transform: { scale: 3, translateX: 20, translateY: -10 },
    });
    expect(controller.isAnimating).toBe(false);
  });

  it("cancels active animations", () => {
    const controller = new TransformAnimationController();
    controller.start({
      duration: 100,
      from: { scale: 1, translateX: 0, translateY: 0 },
      startLOD: 1,
      startTime: 0,
      to: { scale: 2, translateX: 10, translateY: 10 },
    });

    controller.cancel();

    expect(controller.step(50, true)).toBeNull();
    expect(controller.startLOD).toBe(-1);
  });

  it("interpolates standalone transform values", () => {
    expect(
      interpolateTransform(
        { scale: 1, translateX: 10, translateY: 20 },
        { scale: 2, translateX: 30, translateY: 0 },
        0.25,
      ),
    ).toEqual({ scale: 1.25, translateX: 15, translateY: 15 });
  });
});
