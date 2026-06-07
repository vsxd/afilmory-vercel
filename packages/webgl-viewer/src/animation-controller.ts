import type { TransformState } from "./transform-controller";

export interface TransformAnimationStart {
  duration: number;
  from: TransformState;
  startLOD: number;
  startTime: number;
  to: TransformState;
}

export interface TransformAnimationStep {
  done: boolean;
  transform: TransformState;
}

const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

export class TransformAnimationController {
  private animation: TransformAnimationStart | null = null;

  get isAnimating(): boolean {
    return this.animation !== null;
  }

  get startLOD(): number {
    return this.animation?.startLOD ?? -1;
  }

  start(animation: TransformAnimationStart): void {
    this.animation = animation;
  }

  cancel(): void {
    this.animation = null;
  }

  step(now: number, smooth: boolean): TransformAnimationStep | null {
    if (!this.animation) return null;

    const elapsed = now - this.animation.startTime;
    const progress =
      this.animation.duration <= 0
        ? 1
        : Math.min(elapsed / this.animation.duration, 1);
    const easedProgress = smooth ? easeOutQuart(progress) : progress;
    const transform = interpolateTransform(
      this.animation.from,
      this.animation.to,
      easedProgress,
    );

    if (progress >= 1) {
      const finalTransform = this.animation.to;
      this.animation = null;
      return {
        done: true,
        transform: finalTransform,
      };
    }

    return {
      done: false,
      transform,
    };
  }
}

export function interpolateTransform(
  from: TransformState,
  to: TransformState,
  progress: number,
): TransformState {
  return {
    scale: from.scale + (to.scale - from.scale) * progress,
    translateX: from.translateX + (to.translateX - from.translateX) * progress,
    translateY: from.translateY + (to.translateY - from.translateY) * progress,
  };
}
