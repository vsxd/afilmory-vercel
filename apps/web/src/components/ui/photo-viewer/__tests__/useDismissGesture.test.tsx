import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import type { Swiper as SwiperType } from "swiper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DismissSeed, DismissTransform } from "../useDismissGesture";
import { useDismissGesture } from "../useDismissGesture";

// 避免加载 @afilmory/ui 整个 barrel（sonner 用了测试环境无的 tw 宏）；hook 只用到 Spring。
vi.mock("@afilmory/ui", () => ({
  Spring: {
    smooth: (duration = 0.4, extraBounce = 0) => ({
      type: "spring",
      duration,
      bounce: extraBounce,
    }),
    presets: {
      smooth: { type: "spring", duration: 0.4, bounce: 0 },
      snappy: { type: "spring", duration: 0.4, bounce: 0.15 },
    },
  },
}));

// jsdom 不实现 TouchEvent/Touch，这里手工构造带 touches/timeStamp 的合成事件。
function fireTouch(
  el: EventTarget,
  type: string,
  points: Array<{ x: number; y: number }>,
  timeStamp = 0,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((p) => ({ clientX: p.x, clientY: p.y }));
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "targetTouches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: touches });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  el.dispatchEvent(event);
}

function fireMouse(
  el: EventTarget,
  type: string,
  x: number,
  y: number,
  timeStamp = 0,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  el.dispatchEvent(event);
}

interface HarnessOptions {
  enabled?: boolean;
  isImageZoomed?: boolean;
  onDismiss?: (t: DismissTransform) => void;
  onClaim?: () => DismissSeed | void;
}

function setup(opts: HarnessOptions = {}) {
  const onDismiss = opts.onDismiss ?? vi.fn();
  // hook 只读 allowTouchMove，用最小 fixture 即可
  const swiper = { allowTouchMove: true } as Partial<SwiperType> as SwiperType;

  let contentX!: ReturnType<typeof useDismissGesture>["contentX"];
  let contentY!: ReturnType<typeof useDismissGesture>["contentY"];
  let contentScale!: ReturnType<typeof useDismissGesture>["contentScale"];

  const Harness = () => {
    const targetRef = useRef<HTMLDivElement>(null);
    const swiperRef = useRef<SwiperType | null>(swiper);
    const values = useDismissGesture({
      enabled: opts.enabled ?? true,
      targetRef,
      swiperRef,
      isImageZoomed: opts.isImageZoomed ?? false,
      onDismiss,
      onClaim: opts.onClaim,
    });
    contentX = values.contentX;
    contentY = values.contentY;
    contentScale = values.contentScale;
    return <div ref={targetRef} data-testid="media" />;
  };

  const { getByTestId, unmount } = render(<Harness />);
  const el = getByTestId("media");
  return {
    el,
    swiper,
    onDismiss,
    unmount,
    get contentX() {
      return contentX;
    },
    get contentY() {
      return contentY;
    },
    get contentScale() {
      return contentScale;
    },
  };
}

// jsdom 默认 innerHeight = 768 → 距离阈值 = max(120, 768*0.18) ≈ 138
const OVER = 220; // > 阈值
const UNDER = 40; // < 阈值

describe("useDismissGesture", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("向下拖过阈值 → 触发关闭，交出 wrapper 的 {x,y,scale} 变换", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]); // 认领（>10px 竖直）
    fireTouch(t.el, "touchmove", [{ x: 200, y: 200 + OVER }]);
    fireTouch(t.el, "touchend", [{ x: 200, y: 200 + OVER }]);

    expect(t.onDismiss).toHaveBeenCalledTimes(1);
    const arg = (t.onDismiss as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DismissTransform;
    expect(arg.y).toBeGreaterThan(100);
    expect(arg.x).toBe(0); // 普通关闭无水平偏移
    expect(arg.scale).toBeLessThan(1); // 拖拽中缩小
  });

  it("向下拖不过阈值 → 不关闭（弹回）", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 200 + UNDER }]);
    fireTouch(t.el, "touchend", [{ x: 200, y: 200 + UNDER }]);
    expect(t.onDismiss).not.toHaveBeenCalled();
  });

  it("横向拖 → 不认领、不关闭，Swiper 保持可用", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 340, y: 205 }]); // 明显横向
    fireTouch(t.el, "touchmove", [{ x: 380, y: 205 }]);
    fireTouch(t.el, "touchend", [{ x: 380, y: 205 }]);
    expect(t.onDismiss).not.toHaveBeenCalled();
    expect(t.swiper.allowTouchMove).toBe(true); // 未被下滑手势关掉
  });

  it("认领后关掉 Swiper；关闭路径不重新启用它（避免误切图）", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]); // claim
    expect(t.swiper.allowTouchMove).toBe(false);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 200 + OVER }]);
    fireTouch(t.el, "touchend", [{ x: 200, y: 200 + OVER }]);
    // 关闭路径：查看器即将卸载，保持 Swiper 关闭以防 touchend 误切图
    expect(t.swiper.allowTouchMove).toBe(false);
  });

  it("弹回路径恢复 Swiper 可用", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 200 + UNDER }]);
    expect(t.swiper.allowTouchMove).toBe(false);
    fireTouch(t.el, "touchend", [{ x: 200, y: 200 + UNDER }]);
    expect(t.swiper.allowTouchMove).toBe(true);
  });

  it("拖拽中出现第二根手指（pinch）→ 中止本次下滑，不关闭", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]); // claim
    fireTouch(t.el, "touchmove", [
      { x: 200, y: 260 },
      { x: 260, y: 260 },
    ]); // 双指
    fireTouch(t.el, "touchend", [{ x: 200, y: 260 }]);
    expect(t.onDismiss).not.toHaveBeenCalled();
    expect(t.swiper.allowTouchMove).toBe(true); // 已恢复
  });

  it("enabled=false → 完全不认领", () => {
    const t = setup({ enabled: false });
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 200 + OVER }]);
    fireTouch(t.el, "touchend", [{ x: 200, y: 200 + OVER }]);
    expect(t.onDismiss).not.toHaveBeenCalled();
    expect(t.swiper.allowTouchMove).toBe(true);
  });

  it("中断入场：onClaim 返回种子 → wrapper 以种子为基准原地接管", () => {
    const seed: DismissSeed = { x: -50, y: -80, scale: 0.7 };
    const onClaim = vi.fn(() => seed);
    const t = setup({ onClaim });
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }]); // claim（种子在此写入）
    expect(onClaim).toHaveBeenCalledTimes(1);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 260 }]); // 继续下拖 60px
    // contentX 恒为种子 x；contentY = 种子 y + 拖拽距离
    expect(t.contentX.get()).toBe(-50);
    expect(t.contentY.get()).toBeGreaterThan(-80); // -80 + 拖拽
    expect(t.contentY.get()).toBeLessThan(0);
    expect(t.contentScale.get()).toBeLessThanOrEqual(0.7); // 从种子 0.7 起继续缩
  });

  it("桌面：鼠标拖过阈值 → 触发关闭", () => {
    const t = setup();
    fireMouse(t.el, "mousedown", 200, 200);
    fireMouse(window, "mousemove", 200, 216); // claim
    fireMouse(window, "mousemove", 200, 200 + OVER);
    fireMouse(window, "mouseup", 200, 200 + OVER);
    expect(t.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("快速下甩（短距离但高速）→ 触发关闭", () => {
    const t = setup();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }], 0);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 216 }], 10); // claim
    // 60px / 20ms = 3 px/ms ≫ 0.5 阈值，且 dragDy(>40) 满足甩动关闭保护
    fireTouch(t.el, "touchmove", [{ x: 200, y: 276 }], 30);
    fireTouch(t.el, "touchend", [{ x: 200, y: 276 }], 30);
    expect(t.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("卸载时清理监听，不再响应事件", () => {
    const t = setup();
    t.unmount();
    fireTouch(t.el, "touchstart", [{ x: 200, y: 200 }]);
    fireTouch(t.el, "touchmove", [{ x: 200, y: 200 + OVER }]);
    fireTouch(t.el, "touchend", [{ x: 200, y: 200 + OVER }]);
    expect(t.onDismiss).not.toHaveBeenCalled();
  });
});
