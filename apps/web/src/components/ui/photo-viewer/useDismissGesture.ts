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
  /** 释放时相对居中帧的水平偏移（正常关闭为 0；中断入场时含种子的水平偏移） */
  x: number;
  /** 释放时的竖直位移（px，含入场种子偏移） */
  y: number;
  /** 释放时的缩放 */
  scale: number;
  /** 释放时的竖直速度（px/ms），用于退出 FLIP 的速度连续性 */
  velocity: number;
}

/**
 * 中断入场动画时的“种子变换”：让 wrapper 从入场 FLIP 当前所在的位置/大小原地接管，
 * 实现零跳变。x/y 为相对查看器取景框中心的偏移，scale 为相对取景框的缩放。
 */
export interface DismissSeed {
  x: number;
  y: number;
  scale: number;
}

export interface DismissGestureValues {
  contentX: MotionValue<number>;
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
  onClaim,
}: {
  enabled: boolean;
  targetRef: RefObject<HTMLElement | null>;
  swiperRef: RefObject<SwiperType | null>;
  isImageZoomed: boolean;
  onDismiss: (transform: DismissTransform) => void;
  /**
   * 认领纵向拖拽的那一刻触发（用于中断入场动画）。返回种子变换时，wrapper 从入场 FLIP
   * 当前位置/大小原地接管（零跳变）；返回 void 则按普通关闭处理。
   */
  onClaim?: () => DismissSeed | void;
}): DismissGestureValues {
  const reduceMotion = useReducedMotion();

  const contentX = useMotionValue(0);
  const contentY = useMotionValue(0);
  const contentScale = useMotionValue(1);
  const chromeOpacity = useMotionValue(1);
  const revealOpacity = useMotionValue(1);

  // 通过 ref 读最新的 enabled / isImageZoomed / onDismiss，避免每次变化都重挂监听
  const latestRef = useRef({ enabled, isImageZoomed, onDismiss, onClaim });
  latestRef.current = { enabled, isImageZoomed, onDismiss, onClaim };

  // 每次（重新）打开时把 MotionValue 归位，保证干净起点
  useEffect(() => {
    if (!enabled) return;
    contentX.set(0);
    contentY.set(0);
    contentScale.set(1);
    chromeOpacity.set(1);
    revealOpacity.set(1);
  }, [enabled, contentX, contentY, contentScale, chromeOpacity, revealOpacity]);

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
    // 入场中断的种子变换（null=普通关闭）；dragDy=原始拖拽距离（不含种子偏移，用于阈值）
    let seed: DismissSeed | null = null;
    let dragDy = 0;
    let snapControls: Array<{ stop: () => void }> = [];

    const stopSnap = () => {
      snapControls.forEach((c) => c.stop());
      snapControls = [];
    };

    const applyDrag = (dy: number) => {
      dragDy = dy;
      const vh = window.innerHeight || 1;
      const p = Math.min(Math.max(dy / vh, 0), 1);
      // 在种子基础上叠加拖拽：从入场 FLIP 当前位置/大小连续过渡（种子为 null 时即普通关闭）
      const sx = seed ? seed.x : 0;
      const sy = seed ? seed.y : 0;
      const ss = seed ? seed.scale : 1;
      contentX.set(sx);
      contentY.set(sy + dy);
      if (!reduceMotion) {
        contentScale.set(ss * Math.max(MIN_SCALE, 1 - SCALE_FACTOR * p));
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
        animate(contentX, 0, transformT),
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
      seed = null;
      dragDy = 0;
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
          // 认领瞬间中断入场动画：记录入场 FLIP 当前矩形作为种子，wrapper 原地接管（零跳变）
          seed = latestRef.current.onClaim?.() ?? null;
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
        // 阈值判定用原始拖拽距离（不含入场种子偏移），才反映用户的下拉意图
        const shouldDismiss =
          dragDy > distThreshold ||
          (velocity > VELOCITY_THRESHOLD && dragDy > VELOCITY_MIN_TRAVEL);
        if (shouldDismiss) {
          // 交给退出 FLIP 的是 wrapper 的实际变换（含入场种子偏移），飞回原格子亦无缝
          latestRef.current.onDismiss({
            x: contentX.get(),
            y: contentY.get(),
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
    contentX,
    contentY,
    contentScale,
    chromeOpacity,
    revealOpacity,
  ]);

  return {
    contentX,
    contentY,
    contentScale,
    chromeOpacity,
    revealOpacity,
  };
}
