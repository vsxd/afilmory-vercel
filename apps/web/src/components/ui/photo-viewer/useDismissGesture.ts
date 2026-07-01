import { Spring } from "@afilmory/ui";
import type { MotionValue } from "motion/react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { Swiper as SwiperType } from "swiper";

// —— 可调阈值/系数（集中于此，便于调手感）——
const CLAIM_PX = 10; // 判定方向前的位移死区
const VERTICAL_RATIO = 1.7; // dy > |dx|·1.7 ≈ ≤30° 于竖直，才认领（30–45° 让给 swiper）
const SCALE_FACTOR = 0.4; // scale = 1 - SCALE_FACTOR·p
const MIN_SCALE = 0.6;
const DIST_THRESHOLD_RATIO = 0.18; // 关闭距离阈值 = max(120, vh·0.18)
const DIST_THRESHOLD_MIN = 120;
const VELOCITY_THRESHOLD = 0.5; // px/ms，下行甩动
const VELOCITY_MIN_TRAVEL = 40; // 甩动关闭的最小位移保护
const CHROME_FADE_RATIO = 0.12; // 顶栏/缩略图条 ~12% 屏高即淡尽
const REVEAL_FADE_RATIO = 0.6; // 背景（露出瀑布流）淡出更缓

export interface DismissTransform {
  /** 相对居中帧的水平偏移（本手势只走竖直，恒为 0，保留以便 FLIP 种子通用） */
  x: number;
  /** 释放时的竖直位移（px） */
  y: number;
  /** 释放时的缩放 */
  scale: number;
  /** 释放时的竖直速度（px/ms），用于退出 FLIP 的速度连续性 */
  velocity: number;
}

export interface DismissGestureValues {
  contentY: MotionValue<number>;
  contentScale: MotionValue<number>;
  /** 顶栏 + 底部缩略图条透明度 */
  chromeOpacity: MotionValue<number>;
  /** backdrop + thumbhash 背景透明度（1=查看器完全遮挡，0=完全露出瀑布流） */
  revealOpacity: MotionValue<number>;
}

/**
 * iOS 相册式「下滑关闭」手势。
 *
 * 在媒体区祖先元素以 capture 阶段 + {passive:false} 原生 Touch 监听接管**未缩放时的
 * 向下纵向拖拽**（横向/上滑让给 swiper；已缩放让给图片平移）。跟手期间只驱动 MotionValue
 * （transform/opacity，零 React 重渲染）。松手越阈值则 onDismiss(把当前变换交给退出 FLIP)，
 * 否则弹回原位。
 */
export function useDismissGesture({
  enabled,
  targetRef,
  swiperRef,
  isImageZoomed,
  onDismiss,
}: {
  enabled: boolean;
  targetRef: RefObject<HTMLElement | null>;
  swiperRef: RefObject<SwiperType | null>;
  isImageZoomed: boolean;
  onDismiss: (transform: DismissTransform) => void;
}): DismissGestureValues {
  const reduceMotion = useReducedMotion();

  const contentY = useMotionValue(0);
  const contentScale = useMotionValue(1);
  const chromeOpacity = useMotionValue(1);
  const revealOpacity = useMotionValue(1);

  // 通过 ref 读最新的 enabled / isImageZoomed / onDismiss，避免每次变化都重挂监听
  const latestRef = useRef({ enabled, isImageZoomed, onDismiss });
  latestRef.current = { enabled, isImageZoomed, onDismiss };

  // 每次（重新）打开时把 MotionValue 归位，保证干净起点
  useEffect(() => {
    if (!enabled) return;
    contentY.set(0);
    contentScale.set(1);
    chromeOpacity.set(1);
    revealOpacity.set(1);
  }, [enabled, contentY, contentScale, chromeOpacity, revealOpacity]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    type Status = "idle" | "detecting" | "dragging" | "ignored";
    let status: Status = "idle";
    let originX = 0;
    let originY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let snapControls: Array<{ stop: () => void }> = [];

    const stopSnap = () => {
      snapControls.forEach((c) => c.stop());
      snapControls = [];
    };

    const applyDrag = (dy: number) => {
      const vh = window.innerHeight || 1;
      const p = Math.min(Math.max(dy / vh, 0), 1);
      contentY.set(dy);
      if (!reduceMotion) {
        contentScale.set(Math.max(MIN_SCALE, 1 - SCALE_FACTOR * p));
      }
      chromeOpacity.set(
        Math.min(Math.max(1 - dy / (vh * CHROME_FADE_RATIO), 0), 1),
      );
      revealOpacity.set(
        Math.min(Math.max(1 - dy / (vh * REVEAL_FADE_RATIO), 0), 1),
      );
    };

    const snapBack = () => {
      const transformT = reduceMotion
        ? { duration: 0.01 }
        : Spring.smooth(0.35);
      const opacityT = reduceMotion
        ? { duration: 0.01 }
        : Spring.presets.smooth;
      snapControls = [
        animate(contentY, 0, transformT),
        animate(contentScale, 1, transformT),
        animate(chromeOpacity, 1, opacityT),
        animate(revealOpacity, 1, opacityT),
      ];
    };

    const restoreSwiper = () => {
      const s = swiperRef.current;
      if (s) s.allowTouchMove = !latestRef.current.isImageZoomed;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!latestRef.current.enabled || e.touches.length !== 1) {
        if (status === "dragging") {
          snapBack();
          restoreSwiper();
        }
        status = "ignored";
        return;
      }
      stopSnap();
      const t = e.touches[0];
      originX = t.clientX;
      originY = t.clientY;
      lastY = t.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      status = "detecting";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (status === "idle" || status === "ignored") return;
      if (e.touches.length !== 1) {
        if (status === "dragging") {
          snapBack();
          restoreSwiper();
        }
        status = "ignored";
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - originX;
      const dy = t.clientY - originY;

      if (status === "detecting") {
        if (Math.hypot(dx, dy) < CLAIM_PX) return;
        if (dy > 0 && dy > Math.abs(dx) * VERTICAL_RATIO) {
          status = "dragging";
          originY = t.clientY; // 重设基线，避免认领瞬间的跳变
          lastY = t.clientY;
          lastT = e.timeStamp;
          const s = swiperRef.current;
          if (s) s.allowTouchMove = false;
        } else {
          status = "ignored"; // 横向/上滑/斜向 → 交回 swiper
          return;
        }
      }

      if (status === "dragging") {
        e.preventDefault();
        // 认领后独占本次触摸：capture 阶段阻断向下传播，避免 WebGL 画布的
        // input-controller 把这次纵向拖拽当成图片平移抢走（高清图加载中引擎边界
        // 未定、平移未被 limitToBounds 夹住时尤为明显——正是“加载中无法退出”的根因）。
        e.stopPropagation();
        const dt = e.timeStamp - lastT;
        if (dt > 0) velocity = (t.clientY - lastY) / dt;
        lastY = t.clientY;
        lastT = e.timeStamp;
        applyDrag(Math.max(0, t.clientY - originY));
      }
    };

    const onTouchEnd = () => {
      if (status === "dragging") {
        const vh = window.innerHeight || 1;
        const distThreshold = Math.max(
          DIST_THRESHOLD_MIN,
          vh * DIST_THRESHOLD_RATIO,
        );
        const dy = contentY.get();
        const shouldDismiss =
          dy > distThreshold ||
          (velocity > VELOCITY_THRESHOLD && dy > VELOCITY_MIN_TRAVEL);
        if (shouldDismiss) {
          // 把当前变换交给退出 FLIP（不复位实时层，让它随容器退出淡出，避免跳变）
          latestRef.current.onDismiss({
            x: 0,
            y: dy,
            scale: contentScale.get(),
            velocity,
          });
        } else {
          snapBack();
        }
        restoreSwiper();
      }
      status = "idle";
    };

    el.addEventListener("touchstart", onTouchStart, {
      passive: false,
      capture: true,
    });
    el.addEventListener("touchmove", onTouchMove, {
      passive: false,
      capture: true,
    });
    el.addEventListener("touchend", onTouchEnd, { capture: true });
    el.addEventListener("touchcancel", onTouchEnd, { capture: true });

    return () => {
      stopSnap();
      el.removeEventListener("touchstart", onTouchStart, true);
      el.removeEventListener("touchmove", onTouchMove, true);
      el.removeEventListener("touchend", onTouchEnd, true);
      el.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [
    targetRef,
    swiperRef,
    reduceMotion,
    contentY,
    contentScale,
    chromeOpacity,
    revealOpacity,
  ]);

  return {
    contentY,
    contentScale,
    chromeOpacity,
    revealOpacity,
  };
}
